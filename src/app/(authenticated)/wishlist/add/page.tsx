"use client";

import { useState } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookEdition } from "@/lib/types/book";

export default function AddToWishlistPage() {
  const { libraryId, userId } = useLibrary();
  const router = useRouter();

  const [isbn, setIsbn] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<BookEdition | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [priority, setPriority] = useState(3);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const handleIsbnLookup = async () => {
    if (!isbn.trim()) return;
    setLookingUp(true);
    setError("");
    setSearchResults([]);
    setSelectedEdition(null);

    const supabase = createClient();
    const cleaned = isbn.replace(/[^0-9X]/gi, "");

    try {
      const isbnField = cleaned.length === 13 ? "isbn_13" : "isbn_10";
      const { data: existing } = await supabase
        .from("book_editions")
        .select("*")
        .eq(isbnField, cleaned)
        .limit(1)
        .single();

      if (existing) {
        setSelectedEdition(existing as BookEdition);
        setLookingUp(false);
        return;
      }

      const response = await fetch(`https://openlibrary.org/isbn/${cleaned}.json`);
      if (!response.ok) {
        setError("No book found for this ISBN.");
        setLookingUp(false);
        return;
      }
      const olData = await response.json();

      let authors: string[] = [];
      if (olData.authors) {
        const authorPromises = olData.authors.map(async (a: { key: string }) => {
          const res = await fetch(`https://openlibrary.org${a.key}.json`);
          const authorData = await res.json();
          return authorData.name || "Unknown";
        });
        authors = await Promise.all(authorPromises);
      }

      const coverId = olData.covers?.[0];
      const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;

      const { data: newEdition } = await supabase
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

      if (newEdition) {
        setSelectedEdition(newEdition as BookEdition);
      } else {
        setError("Failed to save book data.");
      }
    } catch {
      setError("Something went wrong.");
    }
    setLookingUp(false);
  };

  const handleTitleSearch = async () => {
    if (!titleQuery.trim()) return;
    setSearching(true);
    setError("");
    setSearchResults([]);
    setSelectedEdition(null);

    try {
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
        setError("No books found.");
      }
    } catch {
      setError("Search failed.");
    }
    setSearching(false);
  };

  const handleAddToWishlist = async () => {
    if (!libraryId || !userId || !selectedEdition) return;
    setAdding(true);
    setError("");

    const supabase = createClient();
    let editionId = selectedEdition.id;

    // If from Open Library search, insert edition first
    if (selectedEdition.id.startsWith("/works/")) {
      const { data: newEdition } = await supabase
        .from("book_editions")
        .insert({
          isbn_13: selectedEdition.isbn_13,
          isbn_10: selectedEdition.isbn_10,
          title: selectedEdition.title,
          subtitle: selectedEdition.subtitle,
          authors: selectedEdition.authors,
          publisher: selectedEdition.publisher,
          published_year: selectedEdition.published_year,
          language: selectedEdition.language,
          cover_url: selectedEdition.cover_url,
          open_library_id: selectedEdition.open_library_id,
        })
        .select()
        .single();

      if (!newEdition) {
        setError("Failed to save book data.");
        setAdding(false);
        return;
      }
      editionId = newEdition.id;
    }

    // Check if already owned
    const { data: owned } = await supabase
      .from("library_books")
      .select("id")
      .eq("library_id", libraryId)
      .eq("edition_id", editionId)
      .is("removed_at", null)
      .limit(1)
      .single();

    if (owned) {
      setError("You already own this book!");
      setAdding(false);
      return;
    }

    // Check if already on wishlist
    const { data: existing } = await supabase
      .from("wishlists")
      .select("id")
      .eq("library_id", libraryId)
      .eq("user_id", userId)
      .eq("edition_id", editionId)
      .is("fulfilled_at", null)
      .limit(1)
      .single();

    if (existing) {
      setError("This book is already on your wishlist!");
      setAdding(false);
      return;
    }

    const { error: insertErr } = await supabase.from("wishlists").insert({
      library_id: libraryId,
      user_id: userId,
      edition_id: editionId,
      priority,
      notes: notes || null,
    });

    if (insertErr) {
      setError("Failed to add to wishlist.");
    } else {
      router.push("/wishlist");
    }
    setAdding(false);
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/wishlist"
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
          Add to Wishlist
        </h1>
      </div>

      {/* Show selected edition preview, or search forms */}
      {selectedEdition ? (
        <div className="space-y-4">
          {/* Book preview */}
          <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 flex gap-3">
            <div className="w-16 h-24 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
              {selectedEdition.cover_url ? (
                <img
                  src={selectedEdition.cover_url}
                  alt={selectedEdition.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#E8B4C8]/20">
                  <span className="text-[#E8B4C8] text-xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                    {selectedEdition.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#3D3539] line-clamp-2" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                {selectedEdition.title}
              </h3>
              <p className="text-xs text-[#8A7F85]">
                {selectedEdition.authors?.join(", ") || "Unknown author"}
              </p>
              <button
                onClick={() => setSelectedEdition(null)}
                className="text-xs text-[#B8A9D4] mt-1 hover:underline"
              >
                Choose different book
              </button>
            </div>
          </div>

          {/* Priority selector */}
          <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4">
            <label className="text-sm font-semibold text-[#3D3539] mb-3 block" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Priority
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`w-10 h-10 rounded-full font-medium text-sm transition-all ${
                    p <= priority
                      ? "bg-[#E8B4C8] text-white shadow-sm"
                      : "bg-[#F8F5F0] text-[#8A7F85] hover:bg-[#F0EBE6]"
                  }`}
                >
                  {p}
                </button>
              ))}
              <span className="text-xs text-[#8A7F85] ml-2">
                {priority === 1
                  ? "Nice to have"
                  : priority === 2
                    ? "Interested"
                    : priority === 3
                      ? "Want it"
                      : priority === 4
                        ? "Really want it"
                        : "Must have!"}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4">
            <label className="text-sm font-semibold text-[#3D3539] mb-3 block" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why do you want this book? Any specific edition?"
              rows={3}
              className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[#F5C6AA]/15 border border-[#F5C6AA]/30 rounded-2xl px-4 py-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm text-[#3D3539]">{error}</span>
            </div>
          )}

          {/* Add button */}
          <button
            onClick={handleAddToWishlist}
            disabled={adding}
            className="w-full bg-[#E8B4C8] hover:bg-[#D9A0B6] active:bg-[#CC93AA] disabled:opacity-50 text-white font-medium py-3 rounded-full transition-all text-sm"
          >
            {adding ? "Adding..." : "Add to Wishlist"}
          </button>
        </div>
      ) : (
        <>
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
                className="bg-[#E8B4C8] hover:bg-[#D9A0B6] disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
              >
                {lookingUp ? "Looking up..." : "Look up"}
              </button>
            </div>
          </div>

          {/* Title search */}
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
                className="bg-[#E8B4C8] hover:bg-[#D9A0B6] disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
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
                Select a book
              </h3>
              {searchResults.map((edition) => (
                <button
                  key={edition.id}
                  onClick={() => setSelectedEdition(edition)}
                  className="w-full bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 flex gap-3 text-left hover:border-[#E8B4C8] hover:shadow-md transition-all"
                >
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
                    {edition.cover_url ? (
                      <img
                        src={edition.cover_url}
                        alt={edition.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#E8B4C8]/20">
                        <span className="text-[#E8B4C8] text-sm font-bold">
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
                      <p className="text-xs text-[#8A7F85]">{edition.published_year}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
