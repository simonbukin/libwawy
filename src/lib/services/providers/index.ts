import type { BookProvider } from "./types";
import { openLibraryProvider } from "./openlibrary";
import { googleBooksProvider } from "./google-books";
import { hardcoverProvider } from "./hardcover";
import { openBDProvider } from "./openbd";
import { goodReadsProvider } from "./goodreads";
import { amazonProvider } from "./amazon";

export const ALL_PROVIDERS: BookProvider[] = [
  openLibraryProvider,
  googleBooksProvider,
  hardcoverProvider,
  openBDProvider,
  goodReadsProvider,
  amazonProvider,
];

export const DEFAULT_PRIORITY = ["openlibrary", "google", "goodreads", "amazon", "hardcover", "openbd"];
export const JP_PRIORITY = ["openbd", "hardcover", "openlibrary", "google", "goodreads", "amazon"];

export function getApplicableProviders(isbn: string): BookProvider[] {
  const priority = isbn.startsWith("9784") ? JP_PRIORITY : DEFAULT_PRIORITY;
  return priority
    .map((id) => ALL_PROVIDERS.find((p) => p.id === id))
    .filter((p): p is BookProvider => p !== undefined);
}

export function getSearchProviders(): BookProvider[] {
  return ALL_PROVIDERS.filter((p) => p.searchByTitle !== undefined);
}

export {
  openLibraryProvider,
  googleBooksProvider,
  hardcoverProvider,
  openBDProvider,
  goodReadsProvider,
  amazonProvider,
};
