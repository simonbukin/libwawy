"use client";

import { useState, useEffect, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import { lookupByIsbn } from "@/lib/services/book-lookup";
import Link from "next/link";
import type { BookEdition } from "@/lib/types/book";

function looksLikeIsbn(input: string): boolean {
  const cleaned = input.replace(/[-\s]/g, "");
  return /^[0-9]{10,13}[Xx]?$/.test(cleaned);
}

export default function AddBookPage() {
  const { libraryId } = useLibrary();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookEdition[]>([]);
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
          setSearchResults([edition]);
        } else {
          setError("No book found for this ISBN.");
        }
      } else {
        // Title/author search — local DB first
        const { data: localResults } = await supabase
          .from("book_editions")
          .select("*")
          .or(`title.ilike.%${trimmed}%,authors.cs.{"${trimmed}"}`)
          .limit(10);

        if (localResults && localResults.length > 0) {
          setSearchResults(localResults as BookEdition[]);
        } else {
          // Fallback to Open Library search
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,isbn`
          );
          const data = await response.json();

          if (data.docs && data.docs.length > 0) {
            const editions: BookEdition[] = data.docs.map(
              (doc: {
                key: string;
                title: string;
                author_name?: string[];
                first_publish_year?: number;
                cover_i?: number;
                isbn?: string[];
              }) => ({
                id: doc.key,
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
                search_vector: null,
                fetched_at: new Date().toISOString(),
              })
            );
            setSearchResults(editions);
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

  const handleAddBook = async (edition: BookEdition) => {
    if (!libraryId) return;
    setAddingId(edition.id);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let editionId = edition.id;

    // If this is an Open Library result (not yet in our DB), insert it
    if (edition.id.startsWith("/works/")) {
      const { data: newEdition, error: insertErr } = await supabase
        .from("book_editions")
        .insert({
          isbn_13: edition.isbn_13,
          isbn_10: edition.isbn_10,
          title: edition.title,
          subtitle: edition.subtitle,
          authors: edition.authors,
          publisher: edition.publisher,
          published_year: edition.published_year,
          language: edition.language,
          format: edition.format,
          page_count: edition.page_count,
          cover_url: edition.cover_url,
          open_library_id: edition.open_library_id,
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

    // Check if already in library
    const { data: existing } = await supabase
      .from("library_books")
      .select("id")
      .eq("library_id", libraryId)
      .eq("edition_id", editionId)
      .is("removed_at", null)
      .limit(1)
      .single();

    if (existing) {
      setOwnedEditionIds((prev) => new Set(prev).add(editionId));
      setAddingId(null);
      return;
    }

    const { data: insertedBook, error: addErr } = await supabase.from("library_books").insert({
      library_id: libraryId,
      edition_id: editionId,
      added_by: user?.id || null,
      condition: "good",
      read_status: "unread",
    }).select("id").single();

    if (addErr) {
      setError("Failed to add book. Please try again.");
    } else {
      setAddedIds((prev) => new Set(prev).add(edition.id));
      setOwnedEditionIds((prev) => new Set(prev).add(editionId));
      if (insertedBook) {
        setAddedBookIds((prev) => new Map(prev).set(edition.id, insertedBook.id));
      }
    }

    setAddingId(null);
  };

  const isOwned = (edition: BookEdition) => {
    // Check by database UUID (for local results) or by tracking set (for OL results just added)
    if (ownedEditionIds.has(edition.id) || addedIds.has(edition.id)) return true;
    // Also check by ISBN for Open Library results that might match owned editions
    if (edition.isbn_13 && ownedIsbns.has(edition.isbn_13)) return true;
    if (edition.isbn_10 && ownedIsbns.has(edition.isbn_10)) return true;
    return false;
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/library"
          className="w-8 h-8 rounded-full bg-white border border-[#F0EBE6] flex items-center justify-center hover:bg-[#F8F5F0] transition-colors"
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
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="flex-1 px-3.5 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/60 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Scan barcode link */}
        <Link
          href="/library/scan"
          className="mt-3 flex items-center justify-center gap-2 text-sm text-[#8A7F85] hover:text-[#3D3539] transition-colors"
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
        <div className="bg-[#F5C6AA]/15 border border-[#F5C6AA]/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm text-[#3D3539]">{error}</span>
        </div>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#8A7F85]">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </h3>
          {searchResults.map((edition) => {
            const owned = isOwned(edition);
            const justAdded = addedIds.has(edition.id);
            return (
              <div
                key={edition.id}
                className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 flex gap-3"
              >
                <div className="w-14 h-20 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
                  {edition.cover_url ? (
                    <img
                      src={edition.cover_url}
                      alt={edition.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#B8A9D4]/20">
                      <span className="text-[#B8A9D4] text-lg font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                        {edition.title.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-[#3D3539] line-clamp-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                    {edition.title}
                  </h4>
                  <p className="text-xs text-[#8A7F85] line-clamp-1">
                    {edition.authors?.join(", ") || "Unknown author"}
                  </p>
                  {edition.published_year && (
                    <p className="text-xs text-[#8A7F85] mt-0.5">
                      {edition.published_year}
                    </p>
                  )}
                </div>
                {owned ? (
                  <div className="self-center flex items-center gap-1.5 flex-shrink-0">
                    {justAdded ? (
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {addedBookIds.get(edition.id) && (
                          <Link
                            href={`/library/book/${addedBookIds.get(edition.id)}/edit`}
                            className="text-xs text-[#B8A9D4] hover:text-[#A898C7] font-medium"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[#8A7F85] font-medium">Already owned</span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleAddBook(edition)}
                    disabled={addingId === edition.id}
                    className="self-center bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-full transition-all whitespace-nowrap flex-shrink-0"
                  >
                    {addingId === edition.id ? "Adding..." : "Add"}
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
