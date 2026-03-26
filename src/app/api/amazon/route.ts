import { createClient } from "@/lib/supabase/server";

const BROWSER_HEADERS: Record<string, string> = {
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
  "device-memory": "8",
  downlink: "10",
  dpr: "2",
  ect: "4g",
  rtt: "50",
};

interface AmazonResult {
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

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  return match[1].replace(/<[^>]*>/g, "").trim() || null;
}

function parseSearchResults(
  html: string
): { asin: string; title: string }[] {
  const results: { asin: string; title: string }[] = [];

  // Match search result items with data-asin
  const itemPattern =
    /data-asin="([A-Z0-9]{10})"[\s\S]*?data-cy="title-recipe"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g;

  let match;
  while ((match = itemPattern.exec(html)) !== null) {
    const asin = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").trim();

    // Skip box sets and collections
    const lower = title.toLowerCase();
    if (
      lower.includes("box set") ||
      lower.includes("collection set") ||
      lower.includes("summary & study guide")
    ) {
      continue;
    }

    if (asin && title) {
      results.push({ asin, title });
    }
  }

  return results.slice(0, 3);
}

function parseDetailPage(html: string): AmazonResult {
  // Title
  let rawTitle =
    extractText(html, /id="productTitle"[^>]*>([\s\S]*?)<\/span>/) ??
    extractText(html, /id="ebooksProductTitle"[^>]*>([\s\S]*?)<\/span>/) ??
    null;
  let title = rawTitle;
  let subtitle: string | null = null;
  if (title && title.includes(":")) {
    const parts = title.split(":");
    title = parts[0].trim();
    subtitle = parts.slice(1).join(":").trim() || null;
  }

  // Authors
  const authors: string[] = [];
  const authorPattern =
    /class="author"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g;
  let authorMatch;
  while ((authorMatch = authorPattern.exec(html)) !== null) {
    const name = authorMatch[1].replace(/<[^>]*>/g, "").trim();
    if (name && !authors.includes(name)) authors.push(name);
  }

  // Description
  const description =
    extractText(
      html,
      /data-a-expander-name="book_description_expander"[\s\S]*?class="a-expander-content[^"]*">([\s\S]*?)<\/div>/
    ) ??
    extractText(
      html,
      /id="bookDescription_feature_div"[\s\S]*?<noscript>([\s\S]*?)<\/noscript>/
    ) ??
    null;

  // Cover image — prefer high-res
  let cover_url =
    extractText(html, /id="landingImage"[^>]*data-old-hires="([^"]*)"/) ??
    extractText(html, /id="landingImage"[^>]*src="([^"]*)"/) ??
    null;
  // Clean up Amazon image URL — remove size constraints for better quality
  if (cover_url) {
    cover_url = cover_url.replace(/\._[A-Z][A-Z0-9_]*_\./, ".");
  }

  // ISBN-13 from RPI attributes
  const isbn_13 =
    extractText(
      html,
      /id="rpi-attribute-book_details-isbn13"[\s\S]*?class="rpi-attribute-value"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
    ) ?? null;

  // ISBN-10
  const isbn_10 =
    extractText(
      html,
      /id="rpi-attribute-book_details-isbn10"[\s\S]*?class="rpi-attribute-value"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
    ) ?? null;

  // Page count
  const pageStr = extractText(
    html,
    /id="rpi-attribute-book_details-fiona_pages"[\s\S]*?class="rpi-attribute-value"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
  );
  const page_count = pageStr ? parseInt(pageStr, 10) || null : null;

  // Language
  const language =
    extractText(
      html,
      /id="rpi-attribute-language"[\s\S]*?class="rpi-attribute-value"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
    )?.toLowerCase() ?? null;

  // Publication date
  const pubDateStr = extractText(
    html,
    /id="rpi-attribute-book_details-publication_date"[\s\S]*?class="rpi-attribute-value"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/
  );
  let published_year: number | null = null;
  if (pubDateStr) {
    const yearMatch = pubDateStr.match(/\d{4}/);
    if (yearMatch) published_year = parseInt(yearMatch[0], 10) || null;
  }

  // Publisher — from detail bullets
  let publisher: string | null = null;
  const publisherMatch = html.match(
    /class="a-text-bold"[^>]*>[^<]*(?:Publisher|Verlag|Éditeur|Editore|Editorial)[^<]*<\/span>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i
  );
  if (publisherMatch?.[1]) {
    publisher = publisherMatch[1].replace(/<[^>]*>/g, "").trim();
    // Remove date portion if present (e.g. "Scribner; January 1, 2020")
    if (publisher.includes(";")) {
      publisher = publisher.split(";")[0].trim();
    }
  }

  // ASIN from URL or canonical
  const asin =
    extractText(html, /data-asin="([A-Z0-9]{10})"/) ??
    extractText(html, /\/dp\/([A-Z0-9]{10})/) ??
    null;

  return {
    title,
    subtitle,
    authors,
    description: description
      ?.replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .trim() ?? null,
    cover_url,
    published_year,
    publisher,
    page_count,
    isbn_13,
    isbn_10,
    language,
    asin,
  };
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
  const { isbn, asin } = body as { isbn?: string; asin?: string };

  if (!isbn && !asin) {
    return Response.json({ error: "isbn or asin required" }, { status: 400 });
  }

  const domain = "com";

  try {
    let targetAsin = asin;

    // If we have an ISBN but no ASIN, search for it
    if (!targetAsin && isbn) {
      const searchRes = await fetch(
        `https://www.amazon.${domain}/s?k=${isbn}`,
        { headers: { ...BROWSER_HEADERS, origin: `https://www.amazon.${domain}` } }
      );

      if (!searchRes.ok || searchRes.status === 503) {
        return Response.json({ data: null });
      }

      const searchHtml = await searchRes.text();
      const results = parseSearchResults(searchHtml);
      if (results.length === 0) return Response.json({ data: null });
      targetAsin = results[0].asin;
    }

    if (!targetAsin) return Response.json({ data: null });

    // Small delay before detail fetch
    await new Promise((r) => setTimeout(r, 500));

    // Fetch detail page
    const detailRes = await fetch(
      `https://www.amazon.${domain}/dp/${targetAsin}`,
      { headers: { ...BROWSER_HEADERS, origin: `https://www.amazon.${domain}` } }
    );

    if (!detailRes.ok || detailRes.status === 503) {
      return Response.json({ data: null });
    }

    const detailHtml = await detailRes.text();
    const result = parseDetailPage(detailHtml);

    return Response.json({ data: result });
  } catch {
    return Response.json({ data: null });
  }
}
