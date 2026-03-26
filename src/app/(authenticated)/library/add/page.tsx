"use client";

import { useState, useEffect, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import { lookupByIsbn, searchByTitle } from "@/lib/services/book-lookup";
import Link from "next/link";
import ProviderBadge from "@/components/provider-badge";
import type { ProviderResult } from "@/lib/services/providers/types";
import type { BookEdition } from "@/lib/types/book";

function looksLikeIsbn(input: string): boolean {
  const cleaned = input.replace(/[-\s]/g, "");
  return /^[0-9]{10,13}[Xx]?$/.test(cleaned);
}

export default function AddBookPage() {
  const { libraryId } = useLibrary();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProviderResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addedBookIds, setAddedBookIds] = useState<Map<string, string>>(new Map());
  const [ownedEditionIds, setOwnedEditionIds] = useState<Set<string>>(new Set());
  const [ownedIsbns, setOwnedIsbns] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Load owned edition IDs and ISBNs on mount
  useEffect(() => {
    if (!libraryId) return;
    const supabase = createClient();
    supabase
      .from("library_books")
      .select("edition_id, book_editions(isbn_13, isbn_10)")
      .eq("library_id", libraryId)
      .is("removed_at", null)
      .then(({ data }) => {
        if (data) {
          setOwnedEditionIds(new Set(data.map((b) => b.edition_id)));
          const isbns = new Set<string>();
          for (const b of data) {
            const ed = b.book_editions as unknown as { isbn_13: string | null; isbn_10: string | null };
            if (ed?.isbn_13) isbns.add(ed.isbn_13);
            if (ed?.isbn_10) isbns.add(ed.isbn_10);
          }
          setOwnedIsbns(isbns);
        }
      });
  }, [libraryId]);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError("");
    setSearchResults([]);

    const supabase = createClient();

    try {
      if (looksLikeIsbn(trimmed)) {
        // ISBN lookup using the book-lookup service
        const cleaned = trimmed.replace(/[-\s]/g, "");
        const edition = await lookupByIsbn(cleaned, supabase);
        if (edition) {
          setSearchResults([
            {
              provider: "lookup",
              providerName: "ISBN Lookup",
              confidence: 1,
              data: edition,
            },
          ]);
        } else {
          setError("No book found for this ISBN.");
        }
      } else {
        // Title/author search — local DB first
        const { data: titleResults } = await supabase
          .from("book_editions")
          .select("*")
          .ilike("title", `%${trimmed}%`)
          .limit(10);

        const { data: authorResults } = await supabase
          .from("book_editions")
          .select("*")
          .contains("authors", [trimmed])
          .limit(10);

        // Merge and dedupe
        const seen = new Set<string>();
        const localResults: BookEdition[] = [];
        for (const r of [...(titleResults || []), ...(authorResults || [])]) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            localResults.push(r as BookEdition);
          }
        }

        if (localResults.length > 0) {
          setSearchResults(
            localResults.map((ed) => ({
              provider: "local",
              providerName: "Local",
              confidence: 1,
              data: ed,
            }))
          );
        } else {
          // Fallback to multi-provider title search
          const results = await searchByTitle(trimmed);
          if (results.length > 0) {
            setSearchResults(results);
          } else {
            setError("No books found. Try a different search term.");
          }
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setSearching(false);
  }, [query]);

  const handleAddBook = async (result: ProviderResult) => {
    if (!libraryId) return;
    const edition = result.data as BookEdition;
    const resultId = edition.id || result.data.open_library_id || `${result.provider}-${result.data.isbn_13 || result.data.title}`;
    setAddingId(resultId);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let editionId: string | undefined = edition.id || undefined;

    // If this is a search result (not yet in our DB), insert it
    if (!editionId || editionId.startsWith("/works/")) {
      const { data: newEdition, error: insertErr } = await supabase
        .from("book_editions")
        .insert({
          isbn_13: result.data.isbn_13 ?? null,
          isbn_10: result.data.isbn_10 ?? null,
          title: result.data.title ?? "",
          subtitle: result.data.subtitle ?? null,
          authors: result.data.authors ?? [],
          publisher: result.data.publisher ?? null,
          published_year: result.data.published_year ?? null,
          language: result.data.language ?? "en",
          format: result.data.format ?? null,
          page_count: result.data.page_count ?? null,
          cover_url: result.data.cover_url ?? null,
          open_library_id: result.data.open_library_id ?? null,
          google_books_id: result.data.google_books_id ?? null,
        })
        .select()
        .single();

      if (insertErr || !newEdition) {
        setError("Failed to save book data.");
        setAddingId(null);
        return;
      }
      editionId = newEdition.id;
    }

    // At this point editionId is guaranteed to be set
    const finalEditionId = editionId as string;

    // Check if already in library
    const { data: existing } = await supabase
      .from("library_books")
      .select("id")
      .eq("library_id", libraryId)
      .eq("edition_id", finalEditionId)
      .is("removed_at", null)
      .limit(1)
      .single();

    if (existing) {
      setOwnedEditionIds((prev) => new Set(prev).add(finalEditionId));
      setAddingId(null);
      return;
    }

    const { data: insertedBook, error: addErr } = await supabase.from("library_books").insert({
      library_id: libraryId,
      edition_id: finalEditionId,
      added_by: user?.id || null,
      condition: "good",
      read_status: "unread",
    }).select("id").single();

    if (addErr) {
      setError("Failed to add book. Please try again.");
    } else {
      setAddedIds((prev) => new Set(prev).add(resultId));
      setOwnedEditionIds((prev) => new Set(prev).add(finalEditionId));
      if (insertedBook) {
        setAddedBookIds((prev) => new Map(prev).set(resultId, insertedBook.id));
      }
    }

    setAddingId(null);
  };

  const isOwnedResult = (result: ProviderResult) => {
    const edition = result.data as BookEdition;
    const resultId = edition.id || result.data.open_library_id || `${result.provider}-${result.data.isbn_13 || result.data.title}`;
    if (edition.id && ownedEditionIds.has(edition.id)) return true;
    if (addedIds.has(resultId)) return true;
    if (result.data.isbn_13 && ownedIsbns.has(result.data.isbn_13)) return true;
    if (result.data.isbn_10 && ownedIsbns.has(result.data.isbn_10)) return true;
    return false;
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/library"
          className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-hover transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D3539" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1
          className="text-xl font-bold"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Add Book
        </h1>
      </div>

      {/* Unified search */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="flex-1 px-3.5 py-2.5 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Scan barcode link */}
        <Link
          href="/library/scan"
          className="mt-3 flex items-center justify-center gap-2 text-sm text-muted hover:text-charcoal transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </svg>
          Scan barcode instead
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-peach/15 border border-peach/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2 animate-fade-in-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm text-charcoal">{error}</span>
        </div>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </h3>
          {searchResults.map((result, idx) => {
            const edition = result.data;
            const resultId = (edition as BookEdition).id || result.data.open_library_id || `${result.provider}-${result.data.isbn_13 || result.data.title}`;
            const owned = isOwnedResult(result);
            const justAdded = addedIds.has(resultId);
            return (
              <div
                key={resultId || idx}
                className="bg-card rounded-2xl border border-border shadow-sm p-4 flex gap-3"
              >
                <div className="w-14 h-20 rounded-lg overflow-hidden bg-hover flex-shrink-0">
                  {edition.cover_url ? (
                    <img
                      src={edition.cover_url}
                      alt={edition.title || ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-lavender/20">
                      <span className="text-lavender text-lg font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                        {(edition.title || "?").charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-charcoal line-clamp-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                    {edition.title}
                  </h4>
                  <p className="text-xs text-muted line-clamp-1">
                    {edition.authors?.join(", ") || "Unknown author"}
                  </p>
                  {edition.published_year && (
                    <p className="text-xs text-muted mt-0.5">
                      {edition.published_year}
                    </p>
                  )}
                  {result.provider !== "lookup" && result.provider !== "local" && (
                    <div className="mt-1">
                      <ProviderBadge providers={[result.provider]} />
                    </div>
                  )}
                </div>
                {owned ? (
                  <div className="self-center flex items-center gap-1.5 flex-shrink-0">
                    {justAdded ? (
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {addedBookIds.get(resultId) && (
                          <Link
                            href={`/library/book/${addedBookIds.get(resultId)}/edit`}
                            className="text-xs text-lavender hover:text-lavender-hover font-medium"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted font-medium">Already owned</span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleAddBook(result)}
                    disabled={addingId === resultId}
                    className="self-center bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-full transition-all whitespace-nowrap flex-shrink-0"
                  >
                    {addingId === resultId ? "Adding..." : "Add"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
