import Dexie, { type EntityTable } from "dexie";

export type Note = {
  id: number;
  name: string;
  content: string;
  cursor: number;
  lastOpened?: number;
  status: "pending" | "synced" | "pending-delete";
  dropboxId?: string;
  lastModified: number;
  lastSync?: number;
  syncedContent?: string;
  lastRemoteUpdate?: number;
  googleDriveId?: string;
};

export const db = new Dexie("Mono") as Dexie & {
  notes: EntityTable<Note, "id">;
};

db.version(1).stores({
  notes: "++id, name, content, cursor, lastOpened",
});

db.version(2)
  .stores({
    notes: "++id, name, content, cursor, lastOpened, status, dropboxId",
  })
  .upgrade(async (tx) => {
    // Migrate existing notes to have a status field
    const notes = await tx.table("notes").toArray();
    for (const note of notes) {
      if (!note.status) {
        await tx.table("notes").update(note.id, { status: "pending" });
      }
    }
  });

db.version(3).stores({
  notes: "++id, name, status, content, cursor, lastOpened, dropboxId",
});

db.version(4)
  .stores({
    notes:
      "++id, name, status, content, cursor, lastOpened, dropboxId, lastModified, lastSync, syncedContent",
  })
  .upgrade(async (tx) => {
    const notes = await tx.table("notes").toArray();
    for (const note of notes) {
      await tx.table("notes").update(note.id, {
        lastModified: Date.now(),
        lastSync: 0,
        syncedContent: "",
      });
    }
  });

db.version(5)
  .stores({
    notes:
      "++id, name, status, content, cursor, lastOpened, dropboxId, lastModified, lastSync, syncedContent, lastLocalSync",
  })
  .upgrade(async (tx) => {
    const notes = await tx.table("notes").toArray();
    for (const note of notes) {
      await tx.table("notes").update(note.id, {
        lastLocalSync: 0,
      });
    }
  });

db.version(6).stores({
  notes:
    "++id, name, status, content, cursor, lastOpened, dropboxId, lastModified, lastSync, syncedContent",
});

db.version(8).stores({
  notes:
    "++id, name, status, content, cursor, lastOpened, dropboxId, googleDriveId, lastModified, lastSync, syncedContent, lastRemoteUpdate",
});

db.version(9)
  .stores({
    notes:
      "++id, name, status, content, cursor, lastOpened, dropboxId, googleDriveId, lastModified, lastSync, syncedContent, lastRemoteUpdate",
  })
  .upgrade(async (tx) => {
    const notes = await tx.table("notes").toArray();
    for (const note of notes) {
      if (!note.lastModified) {
        await tx.table("notes").update(note.id, {
          lastModified: note.lastOpened || Date.now(),
        });
      }
    }
  });
