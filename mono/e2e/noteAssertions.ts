import { expect, type Page } from "@playwright/test";

type StoredNote = {
  id: number;
  name: string;
  content: string;
};

const getStoredNotes = async (page: Page): Promise<StoredNote[]> =>
  await page.evaluate(async () => {
    const request = window.indexedDB.open("Mono");

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("upgradeneeded", () => resolve(request.result));
    });

    const transaction = db.transaction("notes", "readonly");
    const store = transaction.objectStore("notes");
    const getAllRequest = store.getAll();

    const notes = await new Promise<StoredNote[]>((resolve, reject) => {
      getAllRequest.addEventListener("success", () => resolve(getAllRequest.result as StoredNote[]));
      getAllRequest.addEventListener("error", () => reject(getAllRequest.error));
    });

    db.close();
    return notes;
  });

export const expectStoredNotes = async (
  page: Page,
  expected: Array<{
    name: string;
    content: string;
  }>,
) => {
  await expect
    .poll(async () => {
      const notes = await getStoredNotes(page);
      return notes.map(({ name, content }) => ({ name, content }));
    })
    .toEqual(expected);
};
