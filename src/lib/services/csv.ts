import Papa from "papaparse";
import type { BookWithEdition } from "@/lib/types/book";

const CSV_COLUMNS = [
  "isbn_13",
  "isbn_10",
  "title",
  "subtitle",
  "authors",
  "publisher",
  "published_year",
  "format",
  "condition",
  "location",
  "read_status",
  "rating",
  "notes",
  "purchase_price",
  "purchase_date",
  "purchase_notes",
  "loaned_to",
  "added_by",
  "added_at",
  "status",
] as const;

export function exportLibraryToCsv(books: BookWithEdition[]): string {
  const rows = books.map((book) => ({
    isbn_13: book.book_editions.isbn_13 ?? "",
    isbn_10: book.book_editions.isbn_10 ?? "",
    title: book.book_editions.title,
    subtitle: book.book_editions.subtitle ?? "",
    authors: (book.book_editions.authors ?? []).join("; "),
    publisher: book.book_editions.publisher ?? "",
    published_year: book.book_editions.published_year ?? "",
    format: book.book_editions.format ?? "",
    condition: book.condition ?? "",
    location: book.location ?? "",
    read_status: book.read_status ?? "",
    rating: book.rating ?? "",
    notes: book.notes ?? "",
    purchase_price: book.purchase_price ?? "",
    purchase_date: book.purchase_date ?? "",
    purchase_notes: book.purchase_notes ?? "",
    loaned_to: book.loaned_to ?? "",
    added_by: book.added_by ?? "",
    added_at: book.added_at ?? "",
    status: book.removed_at ? "removed" : "owned",
  }));

  return Papa.unparse(rows, {
    columns: [...CSV_COLUMNS],
  });
}
