"use client";

import { useState, useEffect, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { BookEdition, BookWithEdition, List } from "@/lib/types/book";

type Mode = "search" | "library" | "create-list";

export default function AddToListPage() {
  const { libraryId, userId } = useLibrary();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedListId = searchParams.get("listId");

  const [mode, setMode] = useState<Mode>("search");
  const [lists, setLists] = useState<List[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(preselectedListId || "");
  const [isbn, setIsbn] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookEdition[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<BookWithEdition[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const fetchLists = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("lists")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    if (data) {
      setLists(data as List[]);
      if (!preselectedListId && data.length > 0) {
        setSelectedListId(data[0].id);
      }
    }
  }, [userId, preselectedListId]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const fetchLibraryBooks = useCallback(async () => {
    if (!libraryId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("library_books")
      .select("*, book_editions(*)")
      .eq("library_id", libraryId)
      .is("removed_at", null)
      .order("added_at", { ascending: false });
    if (data) setLibraryBooks(data as BookWithEdition[]);
  }, [libraryId]);

  useEffect(() => {
    if (mode === "library") fetchLibraryBooks();
  }, [mode, fetchLibraryBooks]);

  const handleIsbnLookup = async () => {
    if (!isbn.trim()) return;
    setLookingUp(true);
    setError("");
    setSearchResults([]);
    const supabase = createClient();
    try {
      const { lookupByIsbn } = await import("@/lib/services/book-lookup");
      const cleaned = isbn.replace(/[^0-9X]/gi, "");
      const found = await lookupByIsbn(cleaned, supabase);
      if (found) {
        setSearchResults([found]);
      } else {
        setError("No book found for this ISBN.");
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
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(titleQuery)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,isbn`
      );
      const data = await response.json();
      if (data.docs?.length > 0) {
        const editions: BookEdition[] = data.docs.map(
          (doc: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; isbn?: string[] }) => ({
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
            cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
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

  const addEditionToList = async (edition: BookEdition) => {
    if (!selectedListId) {
      setError("Please select a list first.");
      return;
    }
    setAdding(edition.id);
    setError("");
    setSuccess("");
    const supabase = createClient();

    let editionId = edition.id;

    // If from Open Library search, insert edition first
    if (edition.id.startsWith("/works/")) {
      const { data: newEdition } = await supabase
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
          cover_url: edition.cover_url,
          open_library_id: edition.open_library_id,
        })
        .select()
        .single();

      if (!newEdition) {
        setError("Failed to save book data.");
        setAdding(null);
        return;
      }
      editionId = newEdition.id;
    }

    // Check if already on this list
    const { data: existing } = await supabase
      .from("list_items")
      .select("id")
      .eq("list_id", selectedListId)
      .eq("edition_id", editionId)
      .limit(1)
      .single();

    if (existing) {
      setError("Already on this list!");
      setAdding(null);
      return;
    }

    const { error: insertErr } = await supabase.from("list_items").insert({
      list_id: selectedListId,
      edition_id: editionId,
    });

    if (insertErr) {
      setError("Failed to add to list.");
    } else {
      const listName = lists.find((l) => l.id === selectedListId)?.name || "list";
      setSuccess(`Added to ${listName}!`);
      setTimeout(() => setSuccess(""), 2000);
    }
    setAdding(null);
  };

  const addLibraryBookToList = async (book: BookWithEdition) => {
    if (!selectedListId) {
      setError("Please select a list first.");
      return;
    }
    setAdding(book.id);
    setError("");
    setSuccess("");
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("list_items")
      .select("id")
      .eq("list_id", selectedListId)
      .eq("edition_id", book.edition_id)
      .limit(1)
      .single();

    if (existing) {
      setError("Already on this list!");
      setAdding(null);
      return;
    }

    const { error: insertErr } = await supabase.from("list_items").insert({
      list_id: selectedListId,
      edition_id: book.edition_id,
      library_book_id: book.id,
    });

    if (insertErr) {
      setError("Failed to add to list.");
    } else {
      const listName = lists.find((l) => l.id === selectedListId)?.name || "list";
      setSuccess(`Added to ${listName}!`);
      setTimeout(() => setSuccess(""), 2000);
    }
    setAdding(null);
  };

  const handleCreateList = async () => {
    if (!newListName.trim() || !libraryId || !userId) return;
    setCreatingList(true);
    const supabase = createClient();
    const slug = newListName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data, error: err } = await supabase
      .from("lists")
      .insert({
        library_id: libraryId,
        user_id: userId,
        name: newListName.trim(),
        slug: slug || `list-${Date.now()}`,
        is_default: false,
      })
      .select()
      .single();

    if (data) {
      setLists((prev) => [...prev, data as List]);
      setSelectedListId(data.id);
      setMode("search");
      setNewListName("");
    } else if (err) {
      setError(err.message);
    }
    setCreatingList(false);
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/lists"
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
          Add to List
        </h1>
      </div>

      {/* List selector */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <label className="text-xs text-[#8A7F85] mb-1.5 block">Add to</label>
        <div className="flex gap-2">
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            className="flex-1 px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all appearance-none"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button
            onClick={() => setMode("create-list")}
            className="px-3 py-2 bg-[#F8F5F0] hover:bg-[#F0EBE6] text-[#3D3539] text-sm rounded-xl transition-all"
          >
            New List
          </button>
        </div>
      </div>

      {/* Create list mode */}
      {mode === "create-list" && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            New List
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name..."
              className="flex-1 px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
            />
            <button
              onClick={handleCreateList}
              disabled={creatingList || !newListName.trim()}
              className="bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-xl transition-all"
            >
              {creatingList ? "Creating..." : "Create"}
            </button>
          </div>
          <button
            onClick={() => setMode("search")}
            className="mt-2 text-xs text-[#8A7F85] hover:text-[#3D3539]"
          >
            Cancel
          </button>
        </div>
      )}

      {mode !== "create-list" && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-2 mb-4" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            <button
              onClick={() => setMode("search")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
                mode === "search"
                  ? "bg-[#B8A9D4] text-white"
                  : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setMode("library")}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
                mode === "library"
                  ? "bg-[#B8A9D4] text-white"
                  : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
              }`}
            >
              From Library
            </button>
          </div>

          {/* Success toast */}
          {success && (
            <div className="bg-[#A8D5BA]/15 border border-[#A8D5BA]/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-sm text-[#3D3539]">{success}</span>
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

          {/* Search mode */}
          {mode === "search" && (
            <>
              {/* ISBN Lookup */}
              <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
                <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
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

              {/* Title search */}
              <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
                <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
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

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#8A7F85]">Results</h3>
                  {searchResults.map((edition) => (
                    <div key={edition.id} className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 flex gap-3">
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
                        {edition.cover_url ? (
                          <img src={edition.cover_url} alt={edition.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#B8A9D4]/20">
                            <span className="text-[#B8A9D4] text-sm font-bold">{edition.title.charAt(0)}</span>
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
                      </div>
                      <button
                        onClick={() => addEditionToList(edition)}
                        disabled={adding === edition.id}
                        className="self-center bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded-full transition-all"
                      >
                        {adding === edition.id ? "Adding..." : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Library mode */}
          {mode === "library" && (
            <div className="grid grid-cols-3 gap-3">
              {libraryBooks.map((book) => (
                <button
                  key={book.id}
                  onClick={() => addLibraryBookToList(book)}
                  disabled={adding === book.id}
                  className="text-left"
                >
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#F8F5F0] mb-1.5">
                    {book.book_editions.cover_url ? (
                      <img src={book.book_editions.cover_url} alt={book.book_editions.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#B8A9D4]/20">
                        <span className="text-[#B8A9D4] text-lg font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                          {book.book_editions.title.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[#3D3539] font-medium line-clamp-1">{book.book_editions.title}</p>
                  <p className="text-[10px] text-[#8A7F85] line-clamp-1">{book.book_editions.authors?.join(", ")}</p>
                  {adding === book.id && (
                    <span className="text-[10px] text-[#B8A9D4]">Adding...</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
