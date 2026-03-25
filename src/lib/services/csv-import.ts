import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupByIsbn } from "@/lib/services/book-lookup";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface CsvRow {
  [key: string]: string;
}

function isGoodreadsFormat(headers: string[]): boolean {
  const goodreadsColumns = ["ISBN13", "Title", "Author", "My Rating", "Exclusive Shelf"];
  return goodreadsColumns.every((col) =>
    headers.some((h) => h.trim() === col)
  );
}

function cleanIsbn(raw: string | undefined): string {
  if (!raw) return "";
  // Goodreads wraps ISBNs in ="..." — strip that, plus quotes and whitespace
  return raw.replace(/^="/, "").replace(/"$/, "").replace(/["\s]/g, "").trim();
}

function mapGoodreadsShelf(shelf: string): "read" | "reading" | "unread" {
  const normalized = shelf.trim().toLowerCase();
  if (normalized === "read") return "read";
  if (normalized === "currently-reading") return "reading";
  return "unread";
}

export async function importCsv(
  file: File,
  libraryId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<ImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: parsed.errors.map((e) => `Row ${e.row}: ${e.message}`),
    };
  }

  const headers = parsed.meta.fields ?? [];
  const isGoodreads = isGoodreadsFormat(headers);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of parsed.data) {
    try {
      let isbn: string;
      let readStatus: "read" | "reading" | "unread";
      let rating: number | null;
      let status: string;

      if (isGoodreads) {
        // Goodreads format
        isbn = cleanIsbn(row["ISBN13"]) || cleanIsbn(row["ISBN"]);
        const shelf = row["Exclusive Shelf"] ?? "to-read";
        readStatus = mapGoodreadsShelf(shelf);
        rating = row["My Rating"] ? parseInt(row["My Rating"], 10) || null : null;
        if (rating === 0) rating = null;
        // Goodreads books go to library unless shelf is to-read (could optionally go to wishlist)
        status = shelf.trim().toLowerCase() === "to-read" ? "wishlisted" : "owned";
      } else {
        // Our native CSV format
        isbn = row["isbn_13"] || row["isbn_10"] || "";
        readStatus = (row["read_status"] as "read" | "reading" | "unread") ?? "unread";
        rating = row["rating"] ? parseInt(row["rating"], 10) || null : null;
        status = row["status"] ?? "owned";
      }

      if (!isbn) {
        skipped++;
        continue;
      }

      // Check if the edition already exists in our cache
      const { data: existing } = await supabase
        .from("book_editions")
        .select("id")
        .or(`isbn_13.eq.${isbn},isbn_10.eq.${isbn}`)
        .limit(1)
        .single();

      let editionId: string;

      if (existing) {
        editionId = existing.id;
      } else {
        // Look up the book via APIs
        const edition = await lookupByIsbn(isbn, supabase);
        if (!edition) {
          errors.push(`Could not find book data for ISBN ${isbn}`);
          skipped++;
          continue;
        }
        editionId = edition.id;
      }

      if (status === "wishlisted") {
        // Check for existing wishlist entry
        const { data: existingWishlist } = await supabase
          .from("wishlists")
          .select("id")
          .eq("user_id", userId)
          .eq("edition_id", editionId)
          .limit(1)
          .single();

        if (existingWishlist) {
          skipped++;
          continue;
        }

        const { error: wishlistError } = await supabase
          .from("wishlists")
          .insert({
            library_id: libraryId,
            user_id: userId,
            edition_id: editionId,
            priority: 3,
            notes: isGoodreads ? null : (row["notes"] || null),
          });

        if (wishlistError) {
          errors.push(`Failed to add wishlist entry for ISBN ${isbn}: ${wishlistError.message}`);
          skipped++;
          continue;
        }
      } else {
        // Check for existing library book (not removed)
        const { data: existingBook } = await supabase
          .from("library_books")
          .select("id")
          .eq("library_id", libraryId)
          .eq("edition_id", editionId)
          .is("removed_at", null)
          .limit(1)
          .single();

        if (existingBook) {
          skipped++;
          continue;
        }

        const insertData: Record<string, unknown> = {
          library_id: libraryId,
          edition_id: editionId,
          added_by: userId,
          read_status: readStatus,
          rating,
        };

        // Include native CSV fields if present
        if (!isGoodreads) {
          if (row["condition"]) insertData.condition = row["condition"];
          if (row["location"]) insertData.location = row["location"];
          if (row["notes"]) insertData.notes = row["notes"];
          if (row["purchase_price"])
            insertData.purchase_price = parseFloat(row["purchase_price"]) || null;
          if (row["purchase_date"]) insertData.purchase_date = row["purchase_date"];
          if (row["purchase_notes"]) insertData.purchase_notes = row["purchase_notes"];
          if (row["loaned_to"]) insertData.loaned_to = row["loaned_to"];
        }

        const { error: bookError } = await supabase
          .from("library_books")
          .insert(insertData);

        if (bookError) {
          errors.push(`Failed to add book for ISBN ${isbn}: ${bookError.message}`);
          skipped++;
          continue;
        }
      }

      imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Unexpected error: ${message}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}
