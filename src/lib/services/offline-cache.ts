interface CachedBook {
  isbn_13: string | null;
  isbn_10: string | null;
  title: string;
}

const CACHE_KEY_PREFIX = "libwawy_library_cache_";

export function saveLibraryCache(
  libraryId: string,
  books: CachedBook[]
): void {
  if (typeof window === "undefined") return;

  try {
    const key = `${CACHE_KEY_PREFIX}${libraryId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        books,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

export function getLibraryCache(
  libraryId: string
): CachedBook[] | null {
  if (typeof window === "undefined") return null;

  try {
    const key = `${CACHE_KEY_PREFIX}${libraryId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed.books as CachedBook[];
  } catch {
    return null;
  }
}

export function checkIsbnOffline(
  libraryId: string,
  isbn: string
): boolean {
  const books = getLibraryCache(libraryId);
  if (!books) return false;

  return books.some(
    (book) => book.isbn_13 === isbn || book.isbn_10 === isbn
  );
}
