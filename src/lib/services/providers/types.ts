import type { BookEdition } from "@/lib/types/book";

export interface BookProvider {
  id: string;
  name: string;
  color: string;
  searchByIsbn(isbn: string): Promise<ProviderResult | null>;
  searchByTitle?(query: string): Promise<ProviderResult[]>;
}

export interface ProviderResult {
  provider: string;
  providerName: string;
  confidence: number;
  data: Partial<BookEdition>;
}

export interface MergedResult {
  data: Partial<BookEdition>;
  providers: string[];
  fieldAttribution: Record<string, string>;
}

export interface FieldOption {
  provider: string;
  providerName: string;
  value: unknown;
}

const IMPORTANT_FIELDS: (keyof BookEdition)[] = [
  "title",
  "authors",
  "cover_url",
  "description",
  "page_count",
  "published_year",
  "genres",
];

export function computeConfidence(data: Partial<BookEdition>): number {
  let filled = 0;
  for (const field of IMPORTANT_FIELDS) {
    const val = data[field];
    if (val === null || val === undefined || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    filled++;
  }
  return filled / IMPORTANT_FIELDS.length;
}
