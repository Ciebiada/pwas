import DiffMatchPatch from "diff-match-patch";
import { db, type Note } from "./db";
import { DropboxProvider } from "./sync/dropboxProvider";
import { GoogleDriveProvider } from "./sync/googleDriveProvider";
import type { RemoteFile, SyncProvider } from "./sync/syncProvider";

type SyncAction = "uploaded" | "downloaded" | "merged" | "deleted" | "renamed" | "none";

type SyncResult =
  | { status: "success"; action: SyncAction }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: Error };

const getLatestNote = async (id: number): Promise<Note | undefined> => {
  return await db.notes.get(id);
};

const syncLocks = new Map<number, Promise<SyncResult>>();

// Helper to determine the correct ID field based on provider
const getRemoteId = (note: Note, providerName: string): string | undefined => {
  if (providerName === "dropbox") return note.dropboxId;
  if (providerName === "googledrive") return note.googleDriveId;
  return undefined;
};

const setRemoteId = async (noteId: number, providerName: string, remoteId: string) => {
  if (providerName === "dropbox") await db.notes.update(noteId, { dropboxId: remoteId });
  if (providerName === "googledrive") await db.notes.update(noteId, { googleDriveId: remoteId });
};

export const wasSynced = (note: Note): boolean => {
  return !!(note.dropboxId || note.googleDriveId);
};

export const syncNote = async (
  noteId: number,
  provider?: SyncProvider,
  onContentUpdate?: (name: string, content: string) => void,
): Promise<SyncResult> => {
  let activeProvider = provider;
  if (!activeProvider) {
    if (DropboxProvider.isAuthenticated()) activeProvider = DropboxProvider;
    else if (GoogleDriveProvider.isAuthenticated()) activeProvider = GoogleDriveProvider;
  }

  if (!activeProvider) {
    return { status: "skipped", reason: "No active sync provider" };
  }

  const previous = syncLocks.get(noteId) || Promise.resolve({ status: "success", action: "none" } as SyncResult);
  const current: Promise<SyncResult> = previous
    .then(() => performSync(noteId, activeProvider!, onContentUpdate))
    .catch((err): SyncResult => {
      console.error(`Error in sync chain for note ${noteId}:`, err);
      return {
        status: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    })
    .finally(() => {
      if (syncLocks.get(noteId) === current) {
        syncLocks.delete(noteId);
      }
    });
  syncLocks.set(noteId, current);
  return current;
};

const uploadAndUpdateState = async (
  noteId: number,
  path: string,
  contentToUpload: string,
  provider: SyncProvider,
): Promise<SyncAction> => {
  const response = await provider.uploadFile(path, contentToUpload);
  const currentNote = await getLatestNote(noteId);
  if (!currentNote) return "none";

  const contentChangedDuringUpload = currentNote.content !== contentToUpload;

  await setRemoteId(noteId, provider.name, response.id);

  await db.notes.update(noteId, {
    status: contentChangedDuringUpload ? "pending" : "synced",
    lastSync: new Date(response.server_modified).getTime(),
    syncedContent: contentToUpload,
  });

  return "uploaded";
};

const performSync = async (
  noteId: number,
  provider: SyncProvider,
  onContentUpdate?: (name: string, content: string) => void,
): Promise<SyncResult> => {
  if (!provider.isAuthenticated()) {
    return { status: "skipped", reason: "Provider not initialized" };
  }

  const note = await getLatestNote(noteId);
  if (!note) {
    return { status: "skipped", reason: "Note not found" };
  }

  if (!note.name || note.name.trim() === "") {
    return { status: "skipped", reason: "Note has no name" };
  }

  const remoteId = getRemoteId(note, provider.name);

  if (note.status === "pending-delete") {
    if (remoteId) {
      console.log(`Deleting note from ${provider.name}: ${note.name}`);
      try {
        await provider.deleteFile(remoteId);
      } catch (e) {
        console.warn("Error deleting remote file", e);
      }
    } else {
      // If no remote ID, check if file exists by name to be safe?
      // For now assume strictly by ID as per design.
      // Actually, if we delete a pending note that was never synced, we just delete locally.
    }
    await db.notes.delete(note.id);
    return { status: "success", action: "deleted" };
  }

  const filename = `${note.name}.md`;
  // Use remoteId if available, otherwise use filename for lookup/upload path
  const remotePath = remoteId || `/${filename}`;

  try {
    const remoteMetadata = await provider.getFileMetadata(remotePath);

    if (!remoteMetadata && remoteId) {
      console.log(`Note ${note.name} was deleted on ${provider.name}. Deleting locally.`);
      await db.notes.delete(note.id);
      return { status: "success", action: "deleted" };
    }

    if (!remoteMetadata) {
      console.log(`Uploading new note to ${provider.name}: ${note.name}`);
      // For Google Drive, path logic in uploadFile handles name vs ID
      // If we don't have metadata, it means it doesn't exist (or we lost access).
      // We pass /filename so provider knows it's a new file by name.
      const action = await uploadAndUpdateState(note.id, `/${filename}`, note.content, provider);
      return { status: "success", action };
    }

    // Found remote file
    const remoteModified = new Date(remoteMetadata.lastModified).getTime();
    const lastSync = note.lastSync || 0;

    // Ensure we have the ID saved if we found it by name
    if (!remoteId && remoteMetadata.id) {
      await setRemoteId(note.id, provider.name, remoteMetadata.id);
    }

    if (remoteModified <= lastSync) {
      return await handleLocalChanges(note, remoteMetadata, provider);
    }

    return await handleRemoteChanges(note, remoteMetadata, remoteModified, provider, onContentUpdate);
  } catch (error) {
    console.error(`Error syncing note ${noteId}:`, error);
    return {
      status: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

const handleLocalChanges = async (
  note: Note,
  remoteMetadata: RemoteFile,
  provider: SyncProvider,
): Promise<SyncResult> => {
  let syncedContent = note.syncedContent;
  const remoteId = getRemoteId(note, provider.name) || remoteMetadata.id; // Should have it by now

  if (!syncedContent && remoteId) {
    console.log(`Backfilling syncedContent from ${provider.name} for: ${note.name}`);
    syncedContent = await provider.downloadFile(remoteId);
    await db.notes.update(note.id, { syncedContent });
  }

  const currentRemoteName = remoteMetadata.name.replace(/\.md$/, "");
  if (currentRemoteName !== note.name) {
    return await handleRename(note, remoteMetadata, provider);
  }

  if (note.content !== syncedContent) {
    console.log(`Uploading local changes to ${provider.name}: ${note.name}`);
    const action = await uploadAndUpdateState(note.id, remoteId, note.content, provider);
    return { status: "success", action };
  }

  return { status: "success", action: "none" };
};

const handleRename = async (note: Note, remoteMetadata: RemoteFile, provider: SyncProvider): Promise<SyncResult> => {
  console.log(`Renaming note on ${provider.name}: ${remoteMetadata.name} -> ${note.name}.md`);
  const newPath = `/${note.name}.md`;

  try {
    const movedFile = await provider.moveFile(remoteMetadata.id, newPath); // Use ID for move source

    let newLastSync = new Date(movedFile.lastModified).getTime();
    let newRemoteId = movedFile.id;

    if (isNaN(newLastSync) || newLastSync === 0) {
      // Fallback if provider doesn't return full metadata on move
      const meta = await provider.getFileMetadata(newRemoteId);
      if (meta) {
        newLastSync = new Date(meta.lastModified).getTime();
        newRemoteId = meta.id;
      } else {
        console.error("Could not fetch metadata after rename, using Date.now() as fallback");
        newLastSync = Date.now();
      }
    }

    await db.notes.update(note.id, {
      lastSync: newLastSync,
    });
    // Update ID if changed (unlikely for rename but possible)
    await setRemoteId(note.id, provider.name, newRemoteId);

    console.log(`Uploading content after rename: ${note.name}`);
    const action = await uploadAndUpdateState(note.id, newRemoteId, note.content, provider);
    return {
      status: "success",
      action: action === "uploaded" ? "renamed" : action,
    };
  } catch (e) {
    console.error(`Error renaming file on ${provider.name}`, e);
    return {
      status: "error",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
};

const handleRemoteChanges = async (
  note: Note,
  remoteMetadata: RemoteFile,
  remoteModified: number,
  provider: SyncProvider,
  onContentUpdate?: (name: string, content: string) => void,
): Promise<SyncResult> => {
  console.log(`Remote changes detected on ${provider.name} for: ${note.name}`);
  const remoteContent = await provider.downloadFile(remoteMetadata.id); // Use ID
  const dmp = new DiffMatchPatch();

  return await db.transaction("rw", db.notes, async (): Promise<SyncResult> => {
    const currentNote = await db.notes.get(note.id);
    if (!currentNote) {
      return { status: "skipped", reason: "Note deleted during sync" };
    }

    const baseContent = currentNote.syncedContent || remoteContent;
    const localContent = currentNote.content;

    if (localContent === baseContent) {
      console.log(`Fast-forwarding local note to match ${provider.name}: ${currentNote.name}`);
      const newName = remoteMetadata.name.replace(/\.md$/, "");

      await db.notes.update(currentNote.id, {
        name: newName,
        content: remoteContent,
        status: "synced",
        lastSync: remoteModified,
        syncedContent: remoteContent,
        lastModified: remoteModified,
        lastRemoteUpdate: Date.now(),
      });
      onContentUpdate?.(newName, remoteContent);
      return { status: "success", action: "downloaded" };
    }

    console.log(`Merging conflict for: ${currentNote.name}`);
    const patches = dmp.patch_make(baseContent, remoteContent);
    const [mergedContent, results] = dmp.patch_apply(patches, localContent);

    const allPatchesApplied = results.every((result: boolean) => result);
    if (!allPatchesApplied) {
      console.warn(`Merge had conflicts for: ${currentNote.name}.`);
    }

    await db.notes.update(currentNote.id, {
      content: mergedContent,
      status: mergedContent !== remoteContent ? "pending" : "synced",
      lastSync: remoteModified,
      syncedContent: remoteContent,
      lastModified: Date.now(),
      lastRemoteUpdate: Date.now(),
    });

    onContentUpdate?.(currentNote.name, mergedContent);
    return { status: "success", action: "merged" };
  });
};

let isSyncing = false;

const runWithConcurrency = async <T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> => {
  const executing: Promise<unknown>[] = [];

  for (const item of items) {
    const promise = fn(item).finally(() => {
      executing.splice(executing.indexOf(promise), 1);
    });
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
};

export const sync = async (): Promise<void> => {
  if (isSyncing) {
    console.log("Sync already in progress, skipping");
    return;
  }

  // Determine active provider
  let provider: SyncProvider | undefined;
  if (DropboxProvider.isAuthenticated()) provider = DropboxProvider;
  else if (GoogleDriveProvider.isAuthenticated()) provider = GoogleDriveProvider;

  if (!provider) {
    console.log("No sync provider initialized, skipping sync");
    return;
  }

  isSyncing = true;

  try {
    console.log(`Starting ${provider.name} sync...`);

    // Fetch remote files
    // For specific path? Dropbox lists everything from root, Google Drive needs query.
    // listFiles in provider handles this details (lists all relevant markdown files)
    const remoteFiles = await provider.listFiles("");
    const mdFiles = remoteFiles.filter((file) => !file.isFolder && file.name.endsWith(".md"));
    const localNotes = await db.notes.toArray();

    await importRemoteNotes(mdFiles, localNotes, provider);
    await deleteRemovedNotes(mdFiles, localNotes, provider);

    const notesToSync = await db.notes.toArray();
    await runWithConcurrency(notesToSync, 3, (note) => syncNote(note.id, provider!));

    console.log(`${provider.name} sync completed`);
  } catch (error) {
    console.error(`Error syncing with ${provider.name}:`, error);
  } finally {
    isSyncing = false;
  }
};

const deleteRemovedNotes = async (
  remoteFiles: RemoteFile[],
  localNotes: Note[],
  provider: SyncProvider,
): Promise<void> => {
  const remoteIds = new Set(remoteFiles.map((file) => file.id));

  for (const note of localNotes) {
    const remoteId = getRemoteId(note, provider.name);
    // Only delete if the note HAS a remote ID for this provider, but it's not in the list anymore
    if (remoteId && !remoteIds.has(remoteId)) {
      console.log(`Deleting local note removed from ${provider.name}: ${note.name}`);
      await db.notes.delete(note.id);
    }
  }
};

const importRemoteNotes = async (
  remoteFiles: RemoteFile[],
  localNotes: Note[],
  provider: SyncProvider,
): Promise<void> => {
  const notesByRemoteId = new Map(localNotes.map((note) => [getRemoteId(note, provider.name), note]));
  const notesByFilename = new Map(localNotes.map((note) => [`${note.name}.md`, note]));

  for (const file of remoteFiles) {
    const existingNote = notesByRemoteId.get(file.id) || notesByFilename.get(file.name);

    if (!existingNote) {
      console.log(`Importing note from ${provider.name}: ${file.name}`);
      const content = await provider.downloadFile(file.id);
      const name = file.name.replace(/\.md$/, "");

      const newNote = {
        name,
        content,
        cursor: 0,
        lastOpened: Date.now(),
        status: "synced" as const,
        syncedContent: content,
        lastSync: new Date(file.lastModified).getTime(),
        lastModified: new Date(file.lastModified).getTime(),
      };

      // Add ID for the current provider
      if (provider.name === "dropbox") (newNote as any).dropboxId = file.id;
      if (provider.name === "googledrive") (newNote as any).googleDriveId = file.id;

      await db.notes.add(newNote);
    } else {
      const currentRemoteId = getRemoteId(existingNote, provider.name);
      if (!currentRemoteId) {
        console.log(`Linking existing note to ${provider.name}: ${existingNote.name}`);
        await setRemoteId(existingNote.id, provider.name, file.id);
        await db.notes.update(existingNote.id, {
          status: "pending",
        });
      }
    }
  }
};
