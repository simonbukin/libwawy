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

    // Fetch author names
    if (data.authors && data.authors.length > 0) {
      const authorPromises = data.authors.map(async (a) => {
        try {
          const authorRes = await fetch(
            `https://openlibrary.org${a.key}.json`
          );
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

    return {
      isbn_13: data.isbn_13?.[0] ?? null,
      isbn_10: data.isbn_10?.[0] ?? null,
      title: data.title ?? "",
      subtitle: data.subtitle ?? null,
      authors: authorNames,
      publisher: data.publishers?.[0] ?? null,
      published_year: publishedYear,
      language:
        data.languages?.[0]?.key?.replace("/languages/", "") ?? "en",
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

  // Fetch from Open Library first
  let bookData = await fetchOpenLibrary(isbn);

  // Fall back to Google Books if Open Library didn't return enough data
  if (!bookData || !bookData.title || !bookData.authors?.length) {
    const googleData = await fetchGoogleBooks(isbn);
    if (googleData) {
      // Merge: prefer Open Library data where available, fill gaps with Google
      bookData = {
        ...googleData,
        ...Object.fromEntries(
          Object.entries(bookData ?? {}).filter(
            ([, v]) => v !== null && v !== undefined && v !== ""
          )
        ),
        // Always prefer Open Library cover URL if we got OL data
        cover_url:
          bookData?.cover_url ?? googleData.cover_url ?? null,
        // Keep Google Books ID from the fallback
        google_books_id: googleData.google_books_id ?? null,
      };
    }
  }

  if (!bookData || !bookData.title) {
    return null;
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
