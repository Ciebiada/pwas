import Dexie, { type Table } from "dexie";

export type Book = {
  id?: number;
  title: string;
  author: string;
  cover?: Blob | string | ArrayBuffer;
  data: Blob | ArrayBuffer;
  progress: string | number; // CFI string (preferred) or legacy location index (number)
  locations?: string; // Cached locations JSON
  lastOpened?: number;
};

export type PaginationMapRecord = {
  key: string;
  bookId: number;
  layoutSignature: string;
  totalPages: number;
  units: Array<{
    leadingSpineIndex: number;
    renderedSpineCount: number;
    pageCount: number;
    pageStart: number;
  }>;
  updatedAt: number;
};

export class ReadiumDB extends Dexie {
  books!: Table<Book>;
  paginationMaps!: Table<PaginationMapRecord>;

  constructor() {
    super("ReadiumDB");
    this.version(2).stores({
      books: "++id, title, author, lastOpened",
    });
    this.version(3).stores({
      books: "++id, title, author, lastOpened",
      paginationMaps: "key, bookId, layoutSignature, updatedAt",
    });
  }
}

export const db = new ReadiumDB();
