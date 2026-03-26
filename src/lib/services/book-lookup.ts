import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookEdition } from "@/lib/types/book";
import type { ProviderResult, FieldOption } from "./providers/types";
import {
  getApplicableProviders,
  getSearchProviders,
  DEFAULT_PRIORITY,
  JP_PRIORITY,
} from "./providers/index";

// --- Language detection (unchanged logic) ---

const OL_LANGUAGE_MAP: Record<string, string> = {
  eng: "en",
  jpn: "ja",
  deu: "de",
  rus: "ru",
  fra: "fr",
  spa: "es",
  ita: "it",
  por: "pt",
  zho: "zh",
  kor: "ko",
  ara: "ar",
  hin: "hi",
};

const ISBN_PREFIX_LANGUAGE: Record<string, string> = {
  "9784": "ja",
  "9783": "de",
  "9782": "fr",
  "9785": "ru",
};

function isJapaneseIsbn(isbn: string): boolean {
  return isbn.startsWith("9784");
}

function detectLanguage(
  isbn: string,
  sources: (Partial<BookEdition> | null)[]
): string {
  for (const source of sources) {
    if (!source?.language) continue;
    const lang = source.language;
    const mapped = OL_LANGUAGE_MAP[lang] ?? lang;
    if (mapped && mapped !== "en") return mapped;
  }

  for (const [prefix, lang] of Object.entries(ISBN_PREFIX_LANGUAGE)) {
    if (isbn.startsWith(prefix)) return lang;
  }

  for (const source of sources) {
    if (source?.language) {
      const mapped = OL_LANGUAGE_MAP[source.language] ?? source.language;
      if (mapped) return mapped;
    }
  }

  return "en";
}

// --- Parallel fetch + merge ---

async function fetchFromProviders(isbn: string): Promise<ProviderResult[]> {
  const providers = getApplicableProviders(isbn);

  const settled = await Promise.allSettled(
    providers.map((p) => p.searchByIsbn(isbn))
  );

  const priority = isbn.startsWith("9784") ? JP_PRIORITY : DEFAULT_PRIORITY;

  const results: ProviderResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      results.push(result.value);
    }
  }

  // Sort by priority order
  results.sort((a, b) => {
    const ai = priority.indexOf(a.provider);
    const bi = priority.indexOf(b.provider);
    return ai - bi;
  });

  return results;
}

function mergeProviderResults(
  results: ProviderResult[],
  isbn: string
): {
  data: Partial<BookEdition>;
  providers: string[];
  fieldAttribution: Record<string, string>;
} {
  const providers = results.map((r) => r.provider);
  const fieldAttribution: Record<string, string> = {};
  const all = results.map((r) => r.data);

  if (all.length === 0) {
    return { data: {}, providers, fieldAttribution };
  }

  const pickFirst = <K extends keyof BookEdition>(
    key: K
  ): { value: BookEdition[K] | undefined; provider: string | undefined } => {
    for (const result of results) {
      const val = result.data[key];
      if (val !== null && val !== undefined && val !== "") {
        return { value: val, provider: result.provider };
      }
    }
    return { value: undefined, provider: undefined };
  };

  // Authors: prefer source with non-empty array
  let authors: string[] = [];
  let authorsProvider: string | undefined;
  for (const result of results) {
    if (result.data.authors && result.data.authors.length > 0) {
      authors = result.data.authors;
      authorsProvider = result.provider;
      break;
    }
  }
  if (authorsProvider) fieldAttribution.authors = authorsProvider;

  // Description: prefer longest
  let description: string | null = null;
  let descProvider: string | undefined;
  for (const result of results) {
    if (
      result.data.description &&
      (!description || result.data.description.length > description.length)
    ) {
      description = result.data.description;
      descProvider = result.provider;
    }
  }
  if (descProvider) fieldAttribution.description = descProvider;

  // Genres: merge and deduplicate
  const genreSet = new Set<string>();
  const genreProviders: string[] = [];
  for (const result of results) {
    if (result.data.genres) {
      for (const g of result.data.genres) genreSet.add(g);
      if (!genreProviders.includes(result.provider)) {
        genreProviders.push(result.provider);
      }
    }
  }
  const genres = genreSet.size > 0 ? [...genreSet] : null;
  if (genreProviders.length > 0) fieldAttribution.genres = genreProviders[0];

  // Simple fields
  const simpleFields: (keyof BookEdition)[] = [
    "isbn_13",
    "isbn_10",
    "title",
    "subtitle",
    "publisher",
    "published_year",
    "format",
    "page_count",
    "cover_url",
    "open_library_id",
    "google_books_id",
    "hardcover_id",
  ];

  const merged: Partial<BookEdition> = {};
  for (const key of simpleFields) {
    const { value, provider } = pickFirst(key);
    if (value !== undefined) {
      Object.assign(merged, { [key]: value });
      if (provider) fieldAttribution[key] = provider;
    }
  }

  // JP ISBN: prefer OpenBD cover
  const isJP = isJapaneseIsbn(isbn);
  if (isJP) {
    const openBdResult = results.find((r) => r.provider === "openbd");
    if (openBdResult?.data.cover_url) {
      merged.cover_url = openBdResult.data.cover_url;
      fieldAttribution.cover_url = "openbd";
    }
  }

  merged.authors = authors;
  merged.description = description;
  merged.genres = genres;
  merged.language = "en"; // overridden by detectLanguage

  return { data: merged, providers, fieldAttribution };
}

// --- Upsert helper ---

function buildUpsertPayload(bookData: Partial<BookEdition>) {
  return {
    isbn_13: bookData.isbn_13 ?? null,
    isbn_10: bookData.isbn_10 ?? null,
    title: bookData.title,
    subtitle: bookData.subtitle ?? null,
    authors: bookData.authors ?? [],
    publisher: bookData.publisher ?? null,
    published_year: bookData.published_year ?? null,
    language: bookData.language ?? "en",
    format: bookData.format ?? null,
    page_count: bookData.page_count ?? null,
    cover_url: bookData.cover_url ?? null,
    open_library_id: bookData.open_library_id ?? null,
    google_books_id: bookData.google_books_id ?? null,
    hardcover_id: bookData.hardcover_id ?? null,
    description: bookData.description ?? null,
    genres: bookData.genres ?? null,
    fetched_at: new Date().toISOString(),
  };
}

// --- Public API ---

export async function lookupByIsbn(
  isbn: string,
  supabase: SupabaseClient
): Promise<BookEdition | null> {
  // Check the local book_editions cache first
  const { data: cached } = await supabase
    .from("book_editions")
    .select("*")
    .or(`isbn_13.eq.${isbn},isbn_10.eq.${isbn}`)
    .limit(1)
    .single();

  if (cached) {
    return cached as BookEdition;
  }

  const results = await fetchFromProviders(isbn);
  if (results.length === 0) return null;

  const { data: bookData } = mergeProviderResults(results, isbn);

  if (!bookData.title) return null;

  // Fix language detection
  bookData.language = detectLanguage(
    isbn,
    results.map((r) => r.data)
  );

  // Ensure we have the ISBN we searched with
  if (!bookData.isbn_13 && isbn.length === 13) {
    bookData.isbn_13 = isbn;
  }
  if (!bookData.isbn_10 && isbn.length === 10) {
    bookData.isbn_10 = isbn;
  }

  // Upsert into book_editions
  const payload = buildUpsertPayload(bookData);
  const { data: upserted, error } = await supabase
    .from("book_editions")
    .upsert(payload, { onConflict: "isbn_13" })
    .select()
    .single();

  if (error || !upserted) {
    const { data: upserted2 } = await supabase
      .from("book_editions")
      .upsert(payload, { onConflict: "isbn_10" })
      .select()
      .single();

    return (upserted2 as BookEdition) ?? null;
  }

  return upserted as BookEdition;
}

export async function lookupByIsbnWithProviders(
  isbn: string,
  supabase: SupabaseClient
): Promise<{ edition: BookEdition; providers: string[] } | null> {
  // Check cache first
  const { data: cached } = await supabase
    .from("book_editions")
    .select("*")
    .or(`isbn_13.eq.${isbn},isbn_10.eq.${isbn}`)
    .limit(1)
    .single();

  if (cached) {
    // Determine which providers have data based on IDs and ISBN prefix
    const providers: string[] = [];
    const cachedEdition = cached as BookEdition;
    if (cachedEdition.open_library_id) providers.push("openlibrary");
    if (cachedEdition.google_books_id) providers.push("google");
    if (cachedEdition.hardcover_id) providers.push("hardcover");
    if (cachedEdition.language === "ja" || (cachedEdition.isbn_13 && cachedEdition.isbn_13.startsWith("9784"))) {
      providers.push("openbd");
    }
    if (providers.length === 0) providers.push("openlibrary");
    return { edition: cachedEdition, providers };
  }

  const results = await fetchFromProviders(isbn);
  if (results.length === 0) return null;

  const { data: bookData, providers } = mergeProviderResults(results, isbn);

  if (!bookData.title) return null;

  bookData.language = detectLanguage(
    isbn,
    results.map((r) => r.data)
  );

  if (!bookData.isbn_13 && isbn.length === 13) {
    bookData.isbn_13 = isbn;
  }
  if (!bookData.isbn_10 && isbn.length === 10) {
    bookData.isbn_10 = isbn;
  }

  const payload = buildUpsertPayload(bookData);
  const { data: upserted, error } = await supabase
    .from("book_editions")
    .upsert(payload, { onConflict: "isbn_13" })
    .select()
    .single();

  if (error || !upserted) {
    const { data: upserted2 } = await supabase
      .from("book_editions")
      .upsert(payload, { onConflict: "isbn_10" })
      .select()
      .single();

    if (!upserted2) return null;
    return { edition: upserted2 as BookEdition, providers };
  }

  return { edition: upserted as BookEdition, providers };
}

export async function searchByTitle(
  query: string
): Promise<ProviderResult[]> {
  const searchProviders = getSearchProviders();

  const settled = await Promise.allSettled(
    searchProviders.map((p) => p.searchByTitle!(query))
  );

  const allResults: ProviderResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    }
  }

  // Dedupe by ISBN (prefer higher confidence)
  const seen = new Map<string, ProviderResult>();
  const noIsbn: ProviderResult[] = [];

  for (const r of allResults) {
    const isbn = r.data.isbn_13 || r.data.isbn_10;
    if (!isbn) {
      noIsbn.push(r);
      continue;
    }
    const existing = seen.get(isbn);
    if (!existing || r.confidence > existing.confidence) {
      seen.set(isbn, r);
    }
  }

  const deduped = [...seen.values(), ...noIsbn];

  // Sort by confidence descending
  deduped.sort((a, b) => b.confidence - a.confidence);

  return deduped;
}

export async function fetchFieldOptions(
  isbn: string
): Promise<Record<string, FieldOption[]>> {
  const results = await fetchFromProviders(isbn);

  const fields = [
    "title",
    "authors",
    "cover_url",
    "description",
    "publisher",
    "published_year",
    "page_count",
    "genres",
    "format",
  ] as const;

  const options: Record<string, FieldOption[]> = {};

  for (const field of fields) {
    const fieldOptions: FieldOption[] = [];
    for (const result of results) {
      const val = result.data[field];
      if (val === null || val === undefined || val === "") continue;
      if (Array.isArray(val) && val.length === 0) continue;
      fieldOptions.push({
        provider: result.provider,
        providerName: result.providerName,
        value: val,
      });
    }
    if (fieldOptions.length > 0) {
      options[field] = fieldOptions;
    }
  }

  return options;
}

// Re-lookup a single edition, bypassing cache, and update the DB row
export async function refreshEdition(
  edition: BookEdition,
  supabase: SupabaseClient
): Promise<BookEdition | null> {
  const isbn = edition.isbn_13 || edition.isbn_10;
  if (!isbn) return null;

  const results = await fetchFromProviders(isbn);
  if (results.length === 0) return null;

  const { data: bookData } = mergeProviderResults(results, isbn);

  if (!bookData.title) return null;

  bookData.language = detectLanguage(
    isbn,
    results.map((r) => r.data)
  );

  const { data: updated } = await supabase
    .from("book_editions")
    .update({
      title: bookData.title || edition.title,
      subtitle: bookData.subtitle ?? edition.subtitle,
      authors:
        bookData.authors && bookData.authors.length > 0
          ? bookData.authors
          : edition.authors,
      publisher: bookData.publisher ?? edition.publisher,
      published_year: bookData.published_year ?? edition.published_year,
      language: bookData.language ?? edition.language,
      format: bookData.format ?? edition.format,
      page_count: bookData.page_count ?? edition.page_count,
      cover_url: bookData.cover_url ?? edition.cover_url,
      open_library_id: bookData.open_library_id ?? edition.open_library_id,
      google_books_id: bookData.google_books_id ?? edition.google_books_id,
      hardcover_id: bookData.hardcover_id ?? edition.hardcover_id,
      description: bookData.description ?? edition.description,
      genres: bookData.genres ?? edition.genres,
    })
    .eq("id", edition.id)
    .select()
    .single();

  return (updated as BookEdition) ?? null;
}
