import type { Book, BookPage } from "../types";

const DB_NAME = "storybook-v1";
const BOOKS = "books";
const IMAGES = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listUserBooks(): Promise<Book[]> {
  const db = await openDb();
  const all = await reqAsPromise(db.transaction(BOOKS).objectStore(BOOKS).getAll() as IDBRequest<Book[]>);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveBook(book: Book): Promise<void> {
  const db = await openDb();
  await reqAsPromise(db.transaction(BOOKS, "readwrite").objectStore(BOOKS).put(book));
}

export async function deleteBook(book: Book): Promise<void> {
  const db = await openDb();
  const store = db.transaction(BOOKS, "readwrite").objectStore(BOOKS);
  await reqAsPromise(store.delete(book.id));
  const imgStore = db.transaction(IMAGES, "readwrite").objectStore(IMAGES);
  const keys = await reqAsPromise(imgStore.getAllKeys() as IDBRequest<IDBValidKey[]>);
  await Promise.all(
    keys
      .filter((k) => String(k).startsWith(`${book.id}:`))
      .map((k) => reqAsPromise(imgStore.delete(k)))
  );
}

export function imageKey(bookId: string, pageIndex: number): string {
  return `${bookId}:${pageIndex}`;
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await reqAsPromise(db.transaction(IMAGES, "readwrite").objectStore(IMAGES).put(blob, key));
}

export async function getImage(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return reqAsPromise(db.transaction(IMAGES).objectStore(IMAGES).get(key) as IDBRequest<Blob | undefined>);
}

/** Indlæser en bog der er bundlet med app'en (public/books/<id>/book.json). */
export async function loadBuiltinBook(id: string): Promise<Book> {
  const res = await fetch(`${import.meta.env.BASE_URL}books/${id}/book.json`);
  if (!res.ok) throw new Error(`Kunne ikke indlæse bogen (${res.status})`);
  return (await res.json()) as Book;
}

/** Laver et brugbart <img src> for en side. Builtin: URL. Egen: objectURL fra IndexedDB. */
export async function resolvePageImage(book: Book, page: BookPage): Promise<string> {
  if (!page.src) throw new Error("Siden har intet billede");
  if (page.src.startsWith("idb:")) {
    const blob = await getImage(page.src.slice(4));
    if (!blob) throw new Error("Billedet mangler i lageret");
    return URL.createObjectURL(blob);
  }
  if (book.builtin) return `${import.meta.env.BASE_URL}books/${book.id}/${page.src}`;
  return page.src;
}
