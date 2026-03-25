"use client";

import { useState } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookEdition } from "@/lib/types/book";

export default function AddBookPage() {
  const { libraryId } = useLibrary();
  const router = useRouter();

  const [isbn, setIsbn] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookEdition[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleIsbnLookup = async () => {
    if (!isbn.trim()) return;
    setLookingUp(true);
    setError("");
    setSuccessMessage("");
    setSearchResults([]);

    const supabase = createClient();
    const cleaned = isbn.replace(/[^0-9X]/gi, "");

    try {
      // Check local DB first
      const isbnField = cleaned.length === 13 ? "isbn_13" : "isbn_10";
      const { data: existing } = await supabase
        .from("book_editions")
        .select("*")
        .eq(isbnField, cleaned)
        .limit(1)
        .single();

      if (existing) {
        setSearchResults([existing as BookEdition]);
        setLookingUp(false);
        return;
      }

      // Try Open Library
      const response = await fetch(
        `https://openlibrary.org/isbn/${cleaned}.json`
      );
      if (!response.ok) {
        setError("No book found for this ISBN.");
        setLookingUp(false);
        return;
      }
      const olData = await response.json();

      let authors: string[] = [];
      if (olData.authors) {
        const authorPromises = olData.authors.map(
          async (a: { key: string }) => {
            const res = await fetch(
              `https://openlibrary.org${a.key}.json`
            );
            const authorData = await res.json();
            return authorData.name || "Unknown";
          }
        );
        authors = await Promise.all(authorPromises);
      }

      const coverId = olData.covers?.[0];
      const coverUrl = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : null;

      const { data: newEdition, error: insertErr } = await supabase
        .from("book_editions")
        .insert({
          isbn_13: cleaned.length === 13 ? cleaned : null,
          isbn_10: cleaned.length === 10 ? cleaned : null,
          title: olData.title || "Unknown Title",
          subtitle: olData.subtitle || null,
          authors,
          publisher: olData.publishers?.[0] || null,
          published_year: olData.publish_date
            ? parseInt(olData.publish_date.match(/\d{4}/)?.[0] || "0") || null
            : null,
          language: "en",
          format: olData.physical_format || null,
          page_count: olData.number_of_pages || null,
          cover_url: coverUrl,
          open_library_id: olData.key || null,
        })
        .select()
        .single();

      if (insertErr || !newEdition) {
        setError("Failed to save book. Please try again.");
      } else {
        setSearchResults([newEdition as BookEdition]);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setLookingUp(false);
  };

  const handleTitleSearch = async () => {
    if (!titleQuery.trim()) return;
    setSearching(true);
    setError("");
    setSuccessMessage("");
    setSearchResults([]);

    const supabase = createClient();

    try {
      // Search local editions first
      const { data: localResults } = await supabase
        .from("book_editions")
        .select("*")
        .ilike("title", `%${titleQuery}%`)
        .limit(10);

      if (localResults && localResults.length > 0) {
        setSearchResults(localResults as BookEdition[]);
        setSearching(false);
        return;
      }

      // Fallback to Open Library search
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(titleQuery)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,isbn`
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
    } catch {
      setError("Search failed. Please try again.");
    }

    setSearching(false);
  };

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
      setError("This book is already in your library!");
      setAddingId(null);
      return;
    }

    const { error: addErr } = await supabase.from("library_books").insert({
      library_id: libraryId,
      edition_id: editionId,
      added_by: user?.id || null,
      condition: "good",
      read_status: "unread",
    });

    if (addErr) {
      setError("Failed to add book. Please try again.");
    } else {
      setSuccessMessage(`"${edition.title}" added to your library!`);
      setSearchResults((prev) => prev.filter((r) => r.id !== edition.id));
    }

    setAddingId(null);
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

      {/* ISBN Lookup */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Look up by ISBN
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="Enter ISBN..."
            className="flex-1 px-3.5 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-full text-sm text-[#3D3539] placeholder:text-[#8A7F85]/60 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleIsbnLookup()}
          />
          <button
            onClick={handleIsbnLookup}
            disabled={lookingUp || !isbn.trim()}
            className="bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
          >
            {lookingUp ? "Looking up..." : "Look up"}
          </button>
        </div>
      </div>

      {/* Title/Author Search */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Search by title or author
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="Search title or author..."
            className="flex-1 px-3.5 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-full text-sm text-[#3D3539] placeholder:text-[#8A7F85]/60 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
            onKeyDown={(e) => e.key === "Enter" && handleTitleSearch()}
          />
          <button
            onClick={handleTitleSearch}
            disabled={searching || !titleQuery.trim()}
            className="bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="bg-[#A8D5BA]/15 border border-[#A8D5BA]/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sm text-[#3D3539]">{successMessage}</span>
        </div>
      )}

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
          {searchResults.map((edition) => (
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
              <button
                onClick={() => handleAddBook(edition)}
                disabled={addingId === edition.id}
                className="self-center bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white text-xs font-medium py-2 px-4 rounded-full transition-all whitespace-nowrap flex-shrink-0"
              >
                {addingId === edition.id ? "Adding..." : "Add"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
