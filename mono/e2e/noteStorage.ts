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
    const request = window.indexedDB.open("Mono");

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("upgradeneeded", () => resolve(request.result));
    });

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
