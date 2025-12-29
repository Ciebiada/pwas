import Dexie, { type Table } from 'dexie';

export type Book = {
    id?: number;
    title: string;
    author: string;
    cover?: Blob | string | ArrayBuffer;
    data: Blob | ArrayBuffer;
    progress: string | number; // CFI string (preferred) or legacy location index (number)
    locations?: string; // Cached locations JSON
};

export class ReadiumDB extends Dexie {
    books!: Table<Book>;

    constructor() {
        super('ReadiumDB');
        this.version(1).stores({
            books: '++id, title, author',
        });
    }
}

export const db = new ReadiumDB();
