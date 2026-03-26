import { createClient } from "@/lib/supabase/server";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua":
    '"Google Chrome";v="137", "Chromium";v="137", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
};

function extractNextData(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function findInApolloState(
  state: Record<string, unknown>,
  prefix: string
): Record<string, unknown> | null {
  for (const key of Object.keys(state)) {
    if (key.startsWith(prefix)) {
      return state[key] as Record<string, unknown>;
    }
  }
  return null;
}

function resolveRef(
  state: Record<string, unknown>,
  ref: unknown
): Record<string, unknown> | null {
  if (
    ref &&
    typeof ref === "object" &&
    "__ref" in (ref as Record<string, unknown>)
  ) {
    const key = (ref as Record<string, string>).__ref;
    return (state[key] as Record<string, unknown>) ?? null;
  }
  return null;
}

interface GoodReadsResult {
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

function parseBookDetail(html: string): GoodReadsResult | null {
  const nextData = extractNextData(html);
  if (!nextData) return null;

  // Navigate to Apollo state
  const props = nextData.props as Record<string, unknown> | undefined;
  const pageProps = props?.pageProps as Record<string, unknown> | undefined;
  const apolloState = pageProps?.apolloState as
    | Record<string, unknown>
    | undefined;
  if (!apolloState) return null;

  // Find the Book object
  const book = findInApolloState(apolloState, "Book:");
  if (!book) return null;

  // Title and subtitle
  let title = (book.title as string) ?? null;
  let subtitle: string | null = null;
  if (title && title.includes(":")) {
    const parts = title.split(":");
    title = parts[0].trim();
    subtitle = parts.slice(1).join(":").trim() || null;
  }

  // Authors
  const authors: string[] = [];
  const primaryContributor = resolveRef(
    apolloState,
    book.primaryContributorEdge
  );
  if (primaryContributor) {
    const node = resolveRef(apolloState, primaryContributor.node);
    if (node?.name) authors.push(node.name as string);
  }
  // Also check secondary contributors
  const secondaryEdges = book.secondaryContributorEdges;
  if (Array.isArray(secondaryEdges)) {
    for (const edge of secondaryEdges) {
      const resolved = resolveRef(apolloState, edge);
      if (resolved) {
        const node = resolveRef(apolloState, resolved.node);
        if (node?.name) authors.push(node.name as string);
      }
    }
  }

  // Description (strip HTML tags)
  let description = (book.description as string) ?? null;
  if (description) {
    description = description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .trim();
  }

  // Cover image
  const cover_url = (book.imageUrl as string) ?? null;

  // Genres
  const genres: string[] = [];
  const bookGenres = book.bookGenres;
  if (Array.isArray(bookGenres)) {
    for (const ref of bookGenres) {
      const genreObj = resolveRef(apolloState, ref);
      if (genreObj) {
        const genre = resolveRef(apolloState, genreObj.genre);
        if (genre?.name) genres.push(genre.name as string);
      }
    }
  }

  // Work details (rating)
  const work = resolveRef(apolloState, book.work);
  let goodreads_rating: number | null = null;
  if (work) {
    const stats = resolveRef(apolloState, work.stats);
    if (stats?.averageRating) {
      goodreads_rating = Number(stats.averageRating) || null;
    }
  }

  // Details (publication, ISBN, etc.)
  const details = book.details as Record<string, unknown> | undefined;
  let published_year: number | null = null;
  let publisher: string | null = null;
  let page_count: number | null = null;
  let isbn_13: string | null = null;
  let isbn_10: string | null = null;
  let language: string | null = null;

  if (details) {
    publisher = (details.publisher as string) ?? null;
    page_count = details.numPages ? Number(details.numPages) : null;
    isbn_13 = (details.isbn13 as string) ?? null;
    isbn_10 = (details.isbn as string) ?? null;
    language =
      (details.language as Record<string, string>)?.name?.toLowerCase() ?? null;

    const pubDate = details.publicationTime
      ? Number(details.publicationTime)
      : null;
    if (pubDate) {
      published_year = new Date(pubDate).getFullYear();
    }
  }

  // GoodReads ID from the key
  const bookKey = Object.keys(apolloState).find((k) => k.startsWith("Book:"));
  const goodreads_id = bookKey?.replace("Book:kca://book/show/", "") ?? null;

  return {
    title,
    subtitle,
    authors,
    description,
    cover_url,
    published_year,
    publisher,
    page_count,
    isbn_13,
    isbn_10,
    language,
    genres,
    goodreads_rating,
    goodreads_id,
  };
}

// Search results are in traditional HTML — parse with regex
function parseSearchResults(
  html: string
): { goodreads_id: string; title: string; authors: string[] }[] {
  const results: { goodreads_id: string; title: string; authors: string[] }[] =
    [];

  // Find book links in search results table
  const bookPattern =
    /<a class="bookTitle"[^>]*href="\/book\/show\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const authorPattern =
    /<a class="authorName"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = bookPattern.exec(html)) !== null) {
    const id = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();

    // Find authors after this book link
    const afterBook = html.slice(match.index, match.index + 500);
    const authors: string[] = [];
    let authorMatch;
    while ((authorMatch = authorPattern.exec(afterBook)) !== null) {
      const name = authorMatch[1].replace(/<[^>]*>/g, "").trim();
      if (name) authors.push(name);
    }

    if (id && title) {
      results.push({ goodreads_id: id, title, authors });
    }
  }

  return results.slice(0, 5);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { isbn, query, goodreads_id } = body as {
    isbn?: string;
    query?: string;
    goodreads_id?: string;
  };

  try {
    // If we have a GoodReads ID, fetch the detail page directly
    if (goodreads_id) {
      const res = await fetch(
        `https://www.goodreads.com/book/show/${goodreads_id}`,
        { headers: BROWSER_HEADERS }
      );
      if (!res.ok) return Response.json({ data: null });
      const html = await res.text();
      const result = parseBookDetail(html);
      return Response.json({ data: result });
    }

    // ISBN lookup — GoodReads redirects /book/isbn/{isbn} to the book page
    if (isbn) {
      const res = await fetch(
        `https://www.goodreads.com/book/isbn/${isbn}`,
        { headers: BROWSER_HEADERS, redirect: "follow" }
      );
      if (!res.ok) return Response.json({ data: null });
      const html = await res.text();
      const result = parseBookDetail(html);
      return Response.json({ data: result });
    }

    // Title search — returns search results
    if (query) {
      const res = await fetch(
        `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`,
        { headers: BROWSER_HEADERS }
      );
      if (!res.ok) return Response.json({ data: null, results: [] });
      const html = await res.text();
      const results = parseSearchResults(html);
      return Response.json({ data: null, results });
    }

    return Response.json({ error: "isbn, query, or goodreads_id required" }, { status: 400 });
  } catch {
    return Response.json({ data: null });
  }
}
