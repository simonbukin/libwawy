import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

export const hardcoverProvider: BookProvider = {
  id: "hardcover",
  name: "Hardcover",
  color: "lavender",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    try {
      await throttle("hardcover");
      const res = await fetch("/api/hardcover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbn }),
      });

      if (!res.ok) return null;

      const json = await res.json();
      const book = json?.data?.books?.[0];
      if (!book) return null;

      const authors: string[] = (book.contributions || [])
        .map((c: { author?: { name?: string } }) => c.author?.name)
        .filter((n: string | undefined): n is string => !!n);

      const genres: string[] | null =
        book.cached_tags && typeof book.cached_tags === "object"
          ? Object.values(book.cached_tags as Record<string, string>).filter(
              (t): t is string => typeof t === "string"
            )
          : Array.isArray(book.cached_tags)
            ? book.cached_tags
            : null;

      const edition = book.editions?.[0];

      let publishedYear: number | null = null;
      if (edition?.release_date) {
        const match = edition.release_date.match(/\d{4}/);
        if (match) publishedYear = parseInt(match[0], 10) || null;
      }

      // Publisher from edition
      const publishers = edition?.publishers as string[] | undefined;
      const publisher = publishers?.[0] ?? null;

      // Format from edition
      const rawFormat = (edition?.format as string)?.toLowerCase() ?? null;
      const format = rawFormat?.includes("hardcover") || rawFormat?.includes("hardback")
        ? "hardcover"
        : rawFormat?.includes("paperback")
          ? "paperback"
          : rawFormat?.includes("mass market")
            ? "mass_market"
            : rawFormat
              ? "other"
              : null;

      const data: Partial<BookEdition> = {
        isbn_13: edition?.isbn_13 ?? null,
        isbn_10: edition?.isbn_10 ?? null,
        title: book.title ?? "",
        subtitle: null,
        authors,
        description: book.description ?? null,
        genres,
        cover_url: book.cover_image_url ?? null,
        page_count: edition?.pages ?? null,
        published_year: publishedYear,
        publisher,
        format,
        hardcover_id: String(book.id) ?? null,
      };

      return {
        provider: "hardcover",
        providerName: "Hardcover",
        confidence: computeConfidence(data),
        data,
      };
    } catch {
      return null;
    }
  },
};
