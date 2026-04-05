import type { Page } from "@playwright/test";

export const createStoredNote = async (
  page: Page,
  note: {
    name: string;
    content: string;
    cursor?: number;
  },
) => {
  await page.goto("/");

  return await page.evaluate(async (noteData) => {
    const openDb = async () =>
      await new Promise<IDBDatabase>((resolve, reject) => {
        const request = window.indexedDB.open("Mono");

        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      });

    let db: IDBDatabase | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      db = await openDb();
      if (db.objectStoreNames.contains("notes")) break;
      db.close();
      db = null;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!db) {
      throw new Error("notes object store not available");
    }

    const transaction = db.transaction("notes", "readwrite");
    const store = transaction.objectStore("notes");
    const combinedContent = noteData.name + (noteData.content ? `\n${noteData.content}` : "");
    const addRequest = store.add({
      name: noteData.name,
      content: noteData.content,
      cursor: noteData.cursor ?? combinedContent.length,
      lastOpened: Date.now(),
      lastModified: Date.now(),
      status: "pending",
    });

    const id = await new Promise<number>((resolve, reject) => {
      addRequest.addEventListener("success", () => resolve(addRequest.result as number));
      addRequest.addEventListener("error", () => reject(addRequest.error));
    });

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });

    db.close();
    return id;
  }, note);
};
