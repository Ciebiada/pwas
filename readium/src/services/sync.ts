import { type Book, db } from "../db";
import { EpubParser } from "../lib/epub";
import { GoogleDriveProvider } from "./sync/googleDriveProvider";
import type { RemoteFile, SyncProvider } from "./sync/syncProvider";

type SyncedBook = Book & {
  id: number;
  syncId: string;
  syncUpdatedAt: number;
  remoteFileName: string;
};

type RemoteBook = {
  syncId: string;
  title: string;
  author: string;
  fileName: string;
  progress: string | number;
  lastOpened?: number;
  updatedAt: number;
  googleDriveId?: string;
};

type RemoteDeletedBook = {
  syncId: string;
  deletedAt: number;
  title?: string;
  fileName?: string;
  googleDriveId?: string;
};

type RemoteManifest = {
  version: 1;
  updatedAt: number;
  books: RemoteBook[];
  deletedBooks: RemoteDeletedBook[];
};

const MANIFEST_FILE = "readium-library.json";
const EPUB_MIME_TYPE = "application/epub+zip";

let syncPromise: Promise<void> | null = null;

const getActiveProvider = (): SyncProvider | undefined => {
  if (GoogleDriveProvider.isAuthenticated()) return GoogleDriveProvider;
  return undefined;
};

const createSyncId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const sanitizeFilePart = (value: string) => {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return sanitized || "book";
};

const buildRemoteFileName = (book: Book, syncId: string) => {
  return `${sanitizeFilePart(book.title || "book")}-${syncId.slice(0, 8)}.epub`;
};

const getBookProviderRef = (book: Book | RemoteBook): string | undefined => {
  return book.googleDriveId;
};

const getProviderRefUpdate = (ref: string): Partial<Book> => {
  return { googleDriveId: ref };
};

const setRemoteBookProviderRef = (remoteBook: RemoteBook, ref: string) => {
  remoteBook.googleDriveId = ref;
};

const loadManifest = async (
  provider: SyncProvider,
): Promise<{ manifest: RemoteManifest; manifestFile: RemoteFile | null }> => {
  const manifestFile = await provider.getFileByName(MANIFEST_FILE);
  if (!manifestFile) {
    return {
      manifest: {
        version: 1,
        updatedAt: 0,
        books: [],
        deletedBooks: [],
      },
      manifestFile: null,
    };
  }

  try {
    const content = await provider.downloadTextFile(manifestFile.ref);
    const parsed = JSON.parse(content) as RemoteManifest;
    return {
      manifest: {
        version: 1,
        updatedAt: Number(parsed.updatedAt) || 0,
        books: Array.isArray(parsed.books) ? parsed.books : [],
        deletedBooks: Array.isArray(parsed.deletedBooks) ? parsed.deletedBooks : [],
      },
      manifestFile,
    };
  } catch (error) {
    console.error("Could not parse remote Readium manifest:", error);
    return {
      manifest: {
        version: 1,
        updatedAt: 0,
        books: [],
        deletedBooks: [],
      },
      manifestFile,
    };
  }
};

const saveManifest = async (provider: SyncProvider, manifest: RemoteManifest, manifestFile: RemoteFile | null) => {
  manifest.updatedAt = Date.now();
  manifest.books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  manifest.deletedBooks.sort((a, b) => b.deletedAt - a.deletedAt);
  await provider.uploadTextFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), manifestFile?.ref);
};

const ensureBookSyncFields = async (book: Book): Promise<SyncedBook | null> => {
  if (!book.id) return null;

  const syncId = book.syncId || createSyncId();
  const remoteFileName = book.remoteFileName || buildRemoteFileName(book, syncId);
  const syncUpdatedAt = book.syncUpdatedAt || book.lastOpened || Date.now();
  const updates: Partial<Book> = {};

  if (!book.syncId) updates.syncId = syncId;
  if (!book.remoteFileName) updates.remoteFileName = remoteFileName;
  if (!book.syncUpdatedAt) updates.syncUpdatedAt = syncUpdatedAt;

  if (Object.keys(updates).length > 0) {
    await db.books.update(book.id, updates);
  }

  return {
    ...book,
    ...updates,
    id: book.id,
    syncId,
    syncUpdatedAt,
    remoteFileName,
  };
};

const getBookData = async (book: Book): Promise<ArrayBuffer> => {
  if (book.data instanceof ArrayBuffer) return book.data;
  return await new Blob([book.data]).arrayBuffer();
};

const extractCover = async (data: ArrayBuffer): Promise<ArrayBuffer | undefined> => {
  try {
    const parser = new EpubParser();
    await parser.load(data.slice(0));
    const coverHref = await parser.getCoverImageHref();
    if (!coverHref) return undefined;

    const coverBlob = await parser.getFile(coverHref);
    return coverBlob ? await coverBlob.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
};

const uploadBookFileIfNeeded = async (
  book: SyncedBook,
  provider: SyncProvider,
  remoteBook?: RemoteBook,
): Promise<string> => {
  const existingRef = getBookProviderRef(book) || (remoteBook && getBookProviderRef(remoteBook));
  if (existingRef) {
    if (!getBookProviderRef(book)) {
      await db.books.update(book.id, getProviderRefUpdate(existingRef));
    }
    return existingRef;
  }

  const data = await getBookData(book);
  const remoteFile = await provider.uploadBinaryFile(book.remoteFileName, data, EPUB_MIME_TYPE);
  await db.books.update(book.id, getProviderRefUpdate(remoteFile.ref));
  return remoteFile.ref;
};

const toRemoteBook = (book: SyncedBook, remoteRef: string, existing?: RemoteBook): RemoteBook => {
  const remoteBook: RemoteBook = {
    ...existing,
    syncId: book.syncId,
    title: book.title || "Untitled",
    author: book.author || "Unknown",
    fileName: book.remoteFileName,
    progress: book.progress,
    lastOpened: book.lastOpened,
    updatedAt: book.syncUpdatedAt,
  };

  setRemoteBookProviderRef(remoteBook, remoteRef);
  return remoteBook;
};

const applyRemoteMetadata = async (book: SyncedBook, remoteBook: RemoteBook) => {
  const remoteRef = getBookProviderRef(remoteBook) || getBookProviderRef(book);
  const providerUpdate = remoteRef ? getProviderRefUpdate(remoteRef) : {};

  await db.books.update(book.id, {
    title: remoteBook.title,
    author: remoteBook.author,
    progress: remoteBook.progress,
    lastOpened: remoteBook.lastOpened,
    syncUpdatedAt: remoteBook.updatedAt,
    remoteFileName: remoteBook.fileName,
    ...providerUpdate,
  });
};

const importRemoteBook = async (remoteBook: RemoteBook, provider: SyncProvider) => {
  const ref = getBookProviderRef(remoteBook);
  if (!ref) return;

  try {
    const data = await provider.downloadBinaryFile(ref);
    const cover = await extractCover(data);
    const book: Omit<Book, "id"> = {
      title: remoteBook.title || "Untitled",
      author: remoteBook.author || "Unknown",
      data,
      cover,
      progress: remoteBook.progress || 0,
      lastOpened: remoteBook.lastOpened,
      syncId: remoteBook.syncId,
      syncUpdatedAt: remoteBook.updatedAt,
      remoteFileName: remoteBook.fileName,
      ...getProviderRefUpdate(ref),
    };

    await db.books.add(book);
  } catch (error) {
    console.error(`Could not import ${remoteBook.title} from ${provider.name}:`, error);
  }
};

const syncBooks = async (provider: SyncProvider, targetBookIds?: number[], importRemote = true) => {
  const { manifest, manifestFile } = await loadManifest(provider);
  const deletedBySyncId = new Map(manifest.deletedBooks.map((book) => [book.syncId, book]));
  let manifestChanged = false;
  const activeRemoteBooks = manifest.books.filter((book) => !deletedBySyncId.has(book.syncId));

  if (activeRemoteBooks.length !== manifest.books.length) {
    manifest.books = activeRemoteBooks;
    manifestChanged = true;
  }

  const remoteBySyncId = new Map(manifest.books.map((book) => [book.syncId, book]));

  if (importRemote) {
    const localBooks = await db.books.toArray();
    const activeLocalBooks: Book[] = [];

    for (const book of localBooks) {
      if (book.id && book.syncId && deletedBySyncId.has(book.syncId)) {
        await db.books.delete(book.id);
      } else {
        activeLocalBooks.push(book);
      }
    }

    const localSyncIds = new Set(activeLocalBooks.map((book) => book.syncId).filter(Boolean));

    for (const remoteBook of manifest.books) {
      if (!deletedBySyncId.has(remoteBook.syncId) && !localSyncIds.has(remoteBook.syncId)) {
        await importRemoteBook(remoteBook, provider);
      }
    }
  }

  const books = targetBookIds
    ? (await Promise.all(targetBookIds.map((id) => db.books.get(id)))).filter((book): book is Book => !!book)
    : await db.books.toArray();

  for (const book of books) {
    const syncedBook = await ensureBookSyncFields(book);
    if (!syncedBook) continue;

    if (deletedBySyncId.has(syncedBook.syncId)) {
      await db.books.delete(syncedBook.id);
      continue;
    }

    const remoteBook = remoteBySyncId.get(syncedBook.syncId);

    if (remoteBook && remoteBook.updatedAt > syncedBook.syncUpdatedAt) {
      await applyRemoteMetadata(syncedBook, remoteBook);
      continue;
    }

    const remoteRef = await uploadBookFileIfNeeded(syncedBook, provider, remoteBook);
    const nextRemoteBook = toRemoteBook(syncedBook, remoteRef, remoteBook);

    if (!remoteBook) {
      manifest.books.push(nextRemoteBook);
      manifestChanged = true;
    } else if (JSON.stringify(remoteBook) !== JSON.stringify(nextRemoteBook)) {
      Object.assign(remoteBook, nextRemoteBook);
      manifestChanged = true;
    }
  }

  if (manifestChanged) {
    await saveManifest(provider, manifest, manifestFile);
  }
};

const runSync = async (targetBookIds?: number[], importRemote = true): Promise<void> => {
  const provider = getActiveProvider();
  if (!provider) return;

  await syncBooks(provider, targetBookIds, importRemote);
};

export const sync = async (): Promise<void> => {
  if (syncPromise) return syncPromise;
  syncPromise = runSync().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
};

export const syncBook = async (bookId: number): Promise<void> => {
  if (syncPromise) return syncPromise;
  syncPromise = runSync([bookId], false).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
};

export const removeBookFromSync = async (book: Book): Promise<void> => {
  if (!book.syncId) return;
  if (syncPromise) {
    try {
      await syncPromise;
    } catch (error) {
      console.warn("Previous sync failed before delete:", error);
    }
  }

  const provider = getActiveProvider();
  if (!provider) return;

  syncPromise = (async () => {
    const { manifest, manifestFile } = await loadManifest(provider);
    const remoteBook = manifest.books.find((candidate) => candidate.syncId === book.syncId);
    const remoteRef = remoteBook?.googleDriveId || book.googleDriveId;
    const deletedAt = Date.now();

    manifest.books = manifest.books.filter((candidate) => candidate.syncId !== book.syncId);

    const existingDeletedBook = manifest.deletedBooks.find((candidate) => candidate.syncId === book.syncId);
    const deletedBook: RemoteDeletedBook = {
      syncId: book.syncId!,
      deletedAt,
      title: remoteBook?.title || book.title,
      fileName: remoteBook?.fileName || book.remoteFileName,
      googleDriveId: remoteRef,
    };

    if (existingDeletedBook) {
      Object.assign(existingDeletedBook, deletedBook);
    } else {
      manifest.deletedBooks.push(deletedBook);
    }

    await saveManifest(provider, manifest, manifestFile);

    if (remoteRef) {
      try {
        await provider.deleteFile(remoteRef);
      } catch (error) {
        console.warn("Could not delete remote book file:", error);
      }
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
};

export const isSyncEnabled = () => !!getActiveProvider();
