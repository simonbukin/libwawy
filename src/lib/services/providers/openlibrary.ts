import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

interface OpenLibraryEdition {
  title?: string;
  subtitle?: string;
  authors?: { key: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  key?: string;
  works?: { key: string }[];
  physical_format?: string;
  languages?: { key: string }[];
}

interface OpenLibraryWork {
  description?: string | { value: string };
  subjects?: string[];
}

async function fetchIsbn(isbn: string): Promise<Partial<BookEdition> | null> {
  try {
    await throttle("openlibrary");
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (!res.ok) return null;

    const data: OpenLibraryEdition = await res.json();

    let description: string | null = null;
    let subjects: string[] | null = null;
    let authorNames: string[] = [];

    // Fetch work data for description
    if (data.works && data.works.length > 0) {
      const workKey = data.works[0].key;
      try {
        await throttle("openlibrary");
        const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
        if (workRes.ok) {
          const workData: OpenLibraryWork = await workRes.json();
          description =
            typeof workData.description === "string"
              ? workData.description
              : workData.description?.value ?? null;
          subjects = workData.subjects?.slice(0, 10) ?? null;
        }
      } catch {
        // Ignore work fetch failures
      }
    }

    // Fetch author names with 5s timeout per author
    if (data.authors && data.authors.length > 0) {
      const authorPromises = data.authors.map(async (a) => {
        try {
          await throttle("openlibrary");
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const authorRes = await fetch(
            `https://openlibrary.org${a.key}.json`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);
          if (authorRes.ok) {
            const authorData = await authorRes.json();
            return authorData.name as string;
          }
        } catch {
          // Ignore author fetch failures
        }
        return null;
      });
      const results = await Promise.all(authorPromises);
      authorNames = results.filter((n): n is string => n !== null);
    }

    const publishedYear = data.publish_date
      ? parseInt(data.publish_date.match(/\d{4}/)?.[0] ?? "", 10) || null
      : null;

    const format = data.physical_format?.toLowerCase() ?? null;
    const normalizedFormat =
      format?.includes("hardcover") || format?.includes("hardback")
        ? "hardcover"
        : format?.includes("paperback")
          ? "paperback"
          : format?.includes("mass market")
            ? "mass_market"
            : format
              ? "other"
              : null;

    const rawLang =
      data.languages?.[0]?.key?.replace("/languages/", "") ?? null;

    return {
      isbn_13: data.isbn_13?.[0] ?? null,
      isbn_10: data.isbn_10?.[0] ?? null,
      title: data.title ?? "",
      subtitle: data.subtitle ?? null,
      authors: authorNames,
      publisher: data.publishers?.[0] ?? null,
      published_year: publishedYear,
      language: rawLang ?? "en",
      format: normalizedFormat,
      page_count: data.number_of_pages ?? null,
      cover_url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
      open_library_id: data.key ?? null,
      description,
      genres: subjects,
    };
  } catch {
    return null;
  }
}

async function searchTitle(query: string): Promise<ProviderResult[]> {
  try {
    await throttle("openlibrary");
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,isbn`
    );
    const data = await response.json();

    if (!data.docs || data.docs.length === 0) return [];

    return data.docs.map(
      (doc: {
        key: string;
        title: string;
        author_name?: string[];
        first_publish_year?: number;
        cover_i?: number;
        isbn?: string[];
      }) => {
        const editionData: Partial<BookEdition> = {
          isbn_13: doc.isbn?.find((i: string) => i.length === 13) || null,
          isbn_10: doc.isbn?.find((i: string) => i.length === 10) || null,
          title: doc.title,
          subtitle: null,
          authors: doc.author_name || [],
          publisher: null,
          published_year: doc.first_publish_year || null,
          language: "en",
          format: null,
          page_count: null,
          cover_url: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : null,
          open_library_id: doc.key,
          google_books_id: null,
          description: null,
          genres: null,
        };

        return {
          provider: "openlibrary",
          providerName: "Open Library",
          confidence: computeConfidence(editionData),
          data: editionData,
        } satisfies ProviderResult;
      }
    );
  } catch {
    return [];
  }
}

export const openLibraryProvider: BookProvider = {
  id: "openlibrary",
  name: "Open Library",
  color: "mint",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    const data = await fetchIsbn(isbn);
    if (!data) return null;
    return {
      provider: "openlibrary",
      providerName: "Open Library",
      confidence: computeConfidence(data),
      data,
    };
  },

  async searchByTitle(query: string): Promise<ProviderResult[]> {
    return searchTitle(query);
  },
};
