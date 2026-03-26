import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    description?: string;
    language?: string;
    imageLinks?: {
      thumbnail?: string;
    };
    industryIdentifiers?: {
      type: string;
      identifier: string;
    }[];
  };
}

function getApiUrl(params: string): string {
  const base = `https://www.googleapis.com/books/v1/volumes?${params}`;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  return apiKey ? `${base}&key=${apiKey}` : base;
}

function volumeToEdition(volume: GoogleBooksVolume): Partial<BookEdition> {
  const info = volume.volumeInfo;

  const isbn13 =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
    null;
  const isbn10 =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
    null;

  const publishedYear = info.publishedDate
    ? parseInt(info.publishedDate.match(/\d{4}/)?.[0] ?? "", 10) || null
    : null;

  return {
    isbn_13: isbn13,
    isbn_10: isbn10,
    title: info.title ?? "",
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    published_year: publishedYear,
    language: info.language ?? "en",
    page_count: info.pageCount ?? null,
    cover_url: info.imageLinks?.thumbnail ?? null,
    google_books_id: volume.id,
    description: info.description ?? null,
    genres: info.categories ?? null,
  };
}

export const googleBooksProvider: BookProvider = {
  id: "google",
  name: "Google Books",
  color: "slate",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    try {
      await throttle("google");
      const res = await fetch(getApiUrl(`q=isbn:${isbn}`));
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.items || data.items.length === 0) return null;

      const editionData = volumeToEdition(data.items[0]);
      return {
        provider: "google",
        providerName: "Google Books",
        confidence: computeConfidence(editionData),
        data: editionData,
      };
    } catch {
      return null;
    }
  },

  async searchByTitle(query: string): Promise<ProviderResult[]> {
    try {
      await throttle("google");
      const res = await fetch(
        getApiUrl(`q=intitle:${encodeURIComponent(query)}&maxResults=8`)
      );
      if (!res.ok) return [];

      const data = await res.json();
      if (!data.items || data.items.length === 0) return [];

      return data.items.map((volume: GoogleBooksVolume) => {
        const editionData = volumeToEdition(volume);
        return {
          provider: "google",
          providerName: "Google Books",
          confidence: computeConfidence(editionData),
          data: editionData,
        } satisfies ProviderResult;
      });
    } catch {
      return [];
    }
  },
};
