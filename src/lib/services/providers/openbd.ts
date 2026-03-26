import type { BookEdition } from "@/lib/types/book";
import type { BookProvider, ProviderResult } from "./types";
import { computeConfidence } from "./types";
import { throttle } from "./rate-limit";

export const openBDProvider: BookProvider = {
  id: "openbd",
  name: "OpenBD",
  color: "peach",

  async searchByIsbn(isbn: string): Promise<ProviderResult | null> {
    try {
      await throttle("openbd");
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || !data[0]) return null;

      const summary = data[0].summary;
      if (!summary) return null;

      const authorStr: string = summary.author || "";
      const authors = authorStr
        .split(/[／,、]/)
        .map((a: string) => a.trim())
        .filter((a: string) => a.length > 0);

      let publishedYear: number | null = null;
      if (summary.pubdate) {
        const yearMatch = summary.pubdate.match(/\d{4}/);
        if (yearMatch) publishedYear = parseInt(yearMatch[0], 10) || null;
      }

      const editionData: Partial<BookEdition> = {
        isbn_13: summary.isbn || null,
        title: summary.title || "",
        authors,
        publisher: summary.publisher || null,
        published_year: publishedYear,
        language: "ja",
        cover_url: summary.cover || null,
        description: null,
        genres: null,
      };

      return {
        provider: "openbd",
        providerName: "OpenBD",
        confidence: computeConfidence(editionData),
        data: editionData,
      };
    } catch {
      return null;
    }
  },
};
