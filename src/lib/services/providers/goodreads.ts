import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

interface GoodReadsData {
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
  genres: string[];
  goodreads_rating: number | null;
  goodreads_id: string | null;
}

function toEditionData(gr: GoodReadsData): Partial<BookEdition> {
  return {
    title: gr.title ?? "",
    subtitle: gr.subtitle ?? null,
    authors: gr.authors,
    description: gr.description ?? null,
    cover_url: gr.cover_url ?? null,
    published_year: gr.published_year ?? null,
    publisher: gr.publisher ?? null,
    page_count: gr.page_count ?? null,
    isbn_13: gr.isbn_13 ?? null,
    isbn_10: gr.isbn_10 ?? null,
    language: gr.language ?? "en",
    genres: gr.genres.length > 0 ? gr.genres : null,
  };
}

export const goodReadsProvider: BookProvider = {
  id: "goodreads",
  name: "GoodReads",
  color: "sand",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    try {
      await throttle("goodreads");
      const res = await fetch("/api/goodreads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbn }),
      });

      if (!res.ok) return null;
      const json = await res.json();
      if (!json.data) return null;

      const data = toEditionData(json.data as GoodReadsData);
      return {
        provider: "goodreads",
        providerName: "GoodReads",
        confidence: computeConfidence(data),
        data,
      };
    } catch {
      return null;
    }
  },

  async searchByTitle(query: string): Promise<ProviderResult[]> {
    try {
      await throttle("goodreads");
      const res = await fetch("/api/goodreads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) return [];
      const json = await res.json();

      if (!json.results || json.results.length === 0) return [];

      // Search results are minimal — just title + authors + ID
      return json.results.map(
        (r: { goodreads_id: string; title: string; authors: string[] }) => {
          const data: Partial<BookEdition> = {
            title: r.title,
            authors: r.authors,
          };
          return {
            provider: "goodreads",
            providerName: "GoodReads",
            confidence: computeConfidence(data),
            data,
          } satisfies ProviderResult;
        }
      );
    } catch {
      return [];
    }
  },
};
