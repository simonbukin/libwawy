import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookEdition } from "@/lib/types/book";

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

// --- Helpers ---

function isJapaneseIsbn(isbn: string): boolean {
  return isbn.startsWith("9784");
}

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

function detectLanguage(
  isbn: string,
  sources: (Partial<BookEdition> | null)[]
): string {
  // Check if any source returned a non-English language
  for (const source of sources) {
    if (!source?.language) continue;
    const lang = source.language;
    // Map OL-style 3-letter codes
    const mapped = OL_LANGUAGE_MAP[lang] ?? lang;
    if (mapped && mapped !== "en") return mapped;
  }

  // ISBN prefix inference
  for (const [prefix, lang] of Object.entries(ISBN_PREFIX_LANGUAGE)) {
    if (isbn.startsWith(prefix)) return lang;
  }

  // Check if any source explicitly said "en"
  for (const source of sources) {
    if (source?.language) {
      const mapped = OL_LANGUAGE_MAP[source.language] ?? source.language;
      if (mapped) return mapped;
    }
  }

  return "en";
}

function isComplete(data: Partial<BookEdition> | null): boolean {
  if (!data) return false;
  return !!(
    data.title &&
    data.authors &&
    data.authors.length > 0 &&
    data.cover_url &&
    data.description
  );
}

function mergeBookData(
  primary: Partial<BookEdition> | null,
  ...fallbacks: (Partial<BookEdition> | null)[]
): Partial<BookEdition> {
  const all = [primary, ...fallbacks].filter(
    (s): s is Partial<BookEdition> => s !== null
  );
  if (all.length === 0) return {};

  const pickFirst = <K extends keyof BookEdition>(
    key: K
  ): BookEdition[K] | undefined => {
    for (const source of all) {
      const val = source[key];
      if (val !== null && val !== undefined && val !== "") return val;
    }
    return undefined;
  };

  // Authors: prefer source with non-empty array containing real names
  let authors: string[] = [];
  for (const source of all) {
    if (source.authors && source.authors.length > 0) {
      authors = source.authors;
      break;
    }
  }

  // Description: prefer longest
  let description: string | null = null;
  for (const source of all) {
    if (source.description && (!description || source.description.length > description.length)) {
      description = source.description;
    }
  }

  // Genres: merge and deduplicate
  const genreSet = new Set<string>();
  for (const source of all) {
    if (source.genres) {
      for (const g of source.genres) genreSet.add(g);
    }
  }
  const genres = genreSet.size > 0 ? [...genreSet] : null;

  // IDs: always from the right source
  let openLibraryId: string | null = null;
  let googleBooksId: string | null = null;
  for (const source of all) {
    if (source.open_library_id && !openLibraryId)
      openLibraryId = source.open_library_id;
    if (source.google_books_id && !googleBooksId)
      googleBooksId = source.google_books_id;
  }

  return {
    isbn_13: pickFirst("isbn_13") ?? null,
    isbn_10: pickFirst("isbn_10") ?? null,
    title: pickFirst("title") ?? "",
    subtitle: pickFirst("subtitle") ?? null,
    authors,
    publisher: pickFirst("publisher") ?? null,
    published_year: pickFirst("published_year") ?? null,
    language: "en", // will be overridden by detectLanguage
    format: pickFirst("format") ?? null,
    page_count: pickFirst("page_count") ?? null,
    cover_url: pickFirst("cover_url") ?? null,
    open_library_id: openLibraryId,
    google_books_id: googleBooksId,
    description,
    genres,
  };
}

// --- Fetchers ---

async function fetchOpenLibrary(
  isbn: string
): Promise<Partial<BookEdition> | null> {
  try {
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

    // Map OL language codes
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

async function fetchGoogleBooks(
  isbn: string
): Promise<Partial<BookEdition> | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;

    const volume: GoogleBooksVolume = data.items[0];
    const info = volume.volumeInfo;

    const isbn13 =
      info.industryIdentifiers?.find((i) => i.type === "ISBN_13")
        ?.identifier ?? null;
    const isbn10 =
      info.industryIdentifiers?.find((i) => i.type === "ISBN_10")
        ?.identifier ?? null;

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
  } catch {
    return null;
  }
}

async function fetchOpenBD(
  isbn: string
): Promise<Partial<BookEdition> | null> {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data[0]) return null;

    const summary = data[0].summary;
    if (!summary) return null;

    // Parse authors — split on "／" and commas
    const authorStr: string = summary.author || "";
    const authors = authorStr
      .split(/[／,、]/)
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0);

    // Parse pubdate (YYYYMMDD or YYYY-MM etc)
    let publishedYear: number | null = null;
    if (summary.pubdate) {
      const yearMatch = summary.pubdate.match(/\d{4}/);
      if (yearMatch) publishedYear = parseInt(yearMatch[0], 10) || null;
    }

    return {
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
  } catch {
    return null;
  }
}

async function fetchHardcover(
  isbn: string
): Promise<Partial<BookEdition> | null> {
  try {
    const res = await fetch("/api/hardcover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const book = json?.data?.books?.[0];
    if (!book) return null;

    // Authors from contributions
    const authors: string[] = (book.contributions || [])
      .map((c: { author?: { name?: string } }) => c.author?.name)
      .filter((n: string | undefined): n is string => !!n);

    // Genres from cached_tags
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

    return {
      isbn_13: edition?.isbn_13 ?? null,
      isbn_10: edition?.isbn_10 ?? null,
      title: book.title ?? "",
      authors,
      description: book.description ?? null,
      genres,
      cover_url: book.cover_image_url ?? null,
      page_count: edition?.pages ?? null,
      published_year: publishedYear,
    };
  } catch {
    return null;
  }
}

// --- Main lookup ---

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

  // Determine source order based on ISBN
  const isJP = isJapaneseIsbn(isbn);

  type Fetcher = (isbn: string) => Promise<Partial<BookEdition> | null>;
  const fetcherChain: Fetcher[] = isJP
    ? [fetchOpenBD, fetchHardcover, fetchOpenLibrary, fetchGoogleBooks]
    : [fetchOpenLibrary, fetchGoogleBooks, fetchHardcover];

  const results: (Partial<BookEdition> | null)[] = [];

  for (const fetcher of fetcherChain) {
    const result = await fetcher(isbn);
    results.push(result);

    // Short-circuit if first source returns complete data
    if (results.length === 1 && isComplete(result)) {
      break;
    }
  }

  // Merge all results
  const [first, ...rest] = results;
  const bookData = mergeBookData(first ?? null, ...rest);

  if (!bookData.title) {
    return null;
  }

  // Fix language detection
  bookData.language = detectLanguage(isbn, results);

  // For JP ISBNs, prefer OpenBD cover
  if (isJP) {
    const openBdResult = results[0]; // OpenBD is first for JP
    if (openBdResult?.cover_url) {
      bookData.cover_url = openBdResult.cover_url;
    }
  }

  // Ensure we have the ISBN we searched with
  if (!bookData.isbn_13 && isbn.length === 13) {
    bookData.isbn_13 = isbn;
  }
  if (!bookData.isbn_10 && isbn.length === 10) {
    bookData.isbn_10 = isbn;
  }

  // Upsert into book_editions
  const { data: upserted, error } = await supabase
    .from("book_editions")
    .upsert(
      {
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
        description: bookData.description ?? null,
        genres: bookData.genres ?? null,
      },
      {
        onConflict: "isbn_13",
      }
    )
    .select()
    .single();

  if (error || !upserted) {
    // If isbn_13 conflict failed, try isbn_10
    const { data: upserted2 } = await supabase
      .from("book_editions")
      .upsert(
        {
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
          description: bookData.description ?? null,
          genres: bookData.genres ?? null,
        },
        {
          onConflict: "isbn_10",
        }
      )
      .select()
      .single();

    return (upserted2 as BookEdition) ?? null;
  }

  return upserted as BookEdition;
}

// Re-lookup a single edition, bypassing cache, and update the DB row
export async function refreshEdition(
  edition: BookEdition,
  supabase: SupabaseClient
): Promise<BookEdition | null> {
  const isbn = edition.isbn_13 || edition.isbn_10;
  if (!isbn) return null;

  const isJP = isJapaneseIsbn(isbn);

  type Fetcher = (isbn: string) => Promise<Partial<BookEdition> | null>;
  const fetcherChain: Fetcher[] = isJP
    ? [fetchOpenBD, fetchHardcover, fetchOpenLibrary, fetchGoogleBooks]
    : [fetchOpenLibrary, fetchGoogleBooks, fetchHardcover];

  const results: (Partial<BookEdition> | null)[] = [];

  for (const fetcher of fetcherChain) {
    const result = await fetcher(isbn);
    results.push(result);
    if (results.length === 1 && isComplete(result)) break;
  }

  const [first, ...rest] = results;
  const bookData = mergeBookData(first ?? null, ...rest);

  if (!bookData.title) return null;

  bookData.language = detectLanguage(isbn, results);

  if (isJP && results[0]?.cover_url) {
    bookData.cover_url = results[0].cover_url;
  }

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
      description: bookData.description ?? edition.description,
      genres: bookData.genres ?? edition.genres,
    })
    .eq("id", edition.id)
    .select()
    .single();

  return (updated as BookEdition) ?? null;
}
