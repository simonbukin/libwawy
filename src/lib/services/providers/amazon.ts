import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

interface AmazonData {
  title: string | null;
  subtitle: string | null;
  authors: string[];
  description: string | null;
  cover_url: string | null;
  published_year: number | null;
  publisher: string | null;
  page_count: number | null;
  isbn_13: string | null;
  isbn_10: string | null;
  language: string | null;
  asin: string | null;
}

export const amazonProvider: BookProvider = {
  id: "amazon",
  name: "Amazon",
  color: "peach",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    try {
      await throttle("amazon");
      const res = await fetch("/api/amazon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbn }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      if (!json.data) return null;

      const amz = json.data as AmazonData;
      const data: Partial<BookEdition> = {
        title: amz.title ?? "",
        subtitle: amz.subtitle ?? null,
        authors: amz.authors,
        description: amz.description ?? null,
        cover_url: amz.cover_url ?? null,
        published_year: amz.published_year ?? null,
        publisher: amz.publisher ?? null,
        page_count: amz.page_count ?? null,
        isbn_13: amz.isbn_13 ?? null,
        isbn_10: amz.isbn_10 ?? null,
        language: amz.language ?? "en",
      };

      return {
        provider: "amazon",
        providerName: "Amazon",
        confidence: computeConfidence(data),
        data,
      };
    } catch {
      return null;
    }
  },

  // No searchByTitle — Amazon search requires ASIN/ISBN
};
