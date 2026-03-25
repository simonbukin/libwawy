"use client";

import { useEffect, useState, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import { createLibrary, joinLibrary } from "@/lib/actions/library";
import BookCard from "@/components/book-card";
import SearchBar from "@/components/search-bar";
import Link from "next/link";
import type { BookWithEdition } from "@/lib/types/book";

export default function LibraryPage() {
  const { libraryId, members, loading: ctxLoading } = useLibrary();
  const [books, setBooks] = useState<BookWithEdition[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<BookWithEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [personFilter, setPersonFilter] = useState<string | null>(null); // user_id or null for "All"
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // read_status or null for "All"

  // Onboarding state
  const [onboardMode, setOnboardMode] = useState<"choose" | "create" | "join">("choose");
  const [libName, setLibName] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState("");

  useEffect(() => {
    async function fetchBooks() {
      if (!libraryId) {
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("library_books")
        .select("*, book_editions(*)")
        .eq("library_id", libraryId)
        .is("removed_at", null)
        .order("added_at", { ascending: false });

      if (!error && data) {
        // Build user_id → display_name map from context members
        const memberMap = new Map<string, string>();
        for (const m of members) {
          if (m.user_id && m.display_name) {
            memberMap.set(m.user_id, m.display_name);
          }
        }
        // Enrich each book with added_by_name
        const enriched = (data as BookWithEdition[]).map((book) => ({
          ...book,
          added_by_name: book.added_by ? memberMap.get(book.added_by) ?? null : null,
        }));
        setBooks(enriched);
        setFilteredBooks(enriched);
      }
      setLoading(false);
    }

    if (!ctxLoading) {
      fetchBooks();
    }
  }, [libraryId, ctxLoading, members]);

  // Combined filter: search + person + read status
  const applyFilters = useCallback(
    (query: string, person: string | null, status: string | null) => {
      let result = books;

      // Person filter
      if (person) {
        result = result.filter((b) => b.added_by === person);
      }

      // Read status filter
      if (status) {
        result = result.filter((b) => b.read_status === status);
      }

      // Search filter
      if (query.trim()) {
        const lower = query.toLowerCase();
        result = result.filter(
          (b) =>
            b.book_editions.title.toLowerCase().includes(lower) ||
            b.book_editions.authors?.some((a) =>
              a.toLowerCase().includes(lower)
            ) ||
            b.book_editions.isbn_13?.includes(query) ||
            b.book_editions.isbn_10?.includes(query)
        );
      }

      setFilteredBooks(result);
    },
    [books]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      applyFilters(query, personFilter, statusFilter);
    },
    [applyFilters, personFilter, statusFilter]
  );

  const handlePersonFilter = useCallback(
    (userId: string | null) => {
      setPersonFilter(userId);
      applyFilters(searchQuery, userId, statusFilter);
    },
    [applyFilters, searchQuery, statusFilter]
  );

  const handleStatusFilter = useCallback(
    (status: string | null) => {
      setStatusFilter(status);
      applyFilters(searchQuery, personFilter, status);
    },
    [applyFilters, searchQuery, personFilter]
  );

  if (loading || ctxLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
          <span className="text-[#8A7F85] text-sm">Loading books...</span>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!libName.trim() || !displayNameInput.trim()) return;
    setOnboardLoading(true);
    setOnboardError("");
    const result = await createLibrary(libName.trim(), displayNameInput.trim());
    if (result.error) {
      setOnboardError(result.error);
      setOnboardLoading(false);
    } else {
      window.location.reload();
    }
  };

  const handleJoin = async () => {
    if (!joinCodeInput.trim() || !displayNameInput.trim()) return;
    setOnboardLoading(true);
    setOnboardError("");
    const result = await joinLibrary(joinCodeInput.trim(), displayNameInput.trim());
    if (result.error) {
      setOnboardError(result.error);
      setOnboardLoading(false);
    } else {
      window.location.reload();
    }
  };

  // No library yet — onboarding
  if (!libraryId) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16">
        <div className="w-16 h-16 rounded-2xl bg-[#B8A9D4]/15 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8A9D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          Welcome to libwawy
        </h2>
        <p className="text-[#8A7F85] text-sm mb-8 text-center max-w-xs">
          Create a new shared library or join an existing one.
        </p>

        {onboardMode === "choose" && (
          <div className="w-full max-w-xs flex flex-col gap-3">
            <button
              onClick={() => setOnboardMode("create")}
              className="w-full bg-[#B8A9D4] hover:bg-[#A898C7] text-white font-medium py-3 rounded-2xl transition-all text-sm"
            >
              Create a Library
            </button>
            <button
              onClick={() => setOnboardMode("join")}
              className="w-full bg-white hover:bg-[#F8F5F0] border border-[#F0EBE6] text-[#3D3539] font-medium py-3 rounded-2xl transition-all text-sm"
            >
              Join with Code
            </button>
          </div>
        )}

        {onboardMode === "create" && (
          <div className="w-full max-w-xs">
            <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-5 space-y-3">
              <input
                type="text"
                value={libName}
                onChange={(e) => setLibName(e.target.value)}
                placeholder="Library name (e.g. Our Bookshelf)"
                className="w-full px-3 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
              />
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="Your display name"
                className="w-full px-3 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
              />
              {onboardError && <p className="text-xs text-[#C97070]">{onboardError}</p>}
              <button
                onClick={handleCreate}
                disabled={onboardLoading || !libName.trim() || !displayNameInput.trim()}
                className="w-full bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
              >
                {onboardLoading ? "Creating..." : "Create Library"}
              </button>
            </div>
            <button
              onClick={() => { setOnboardMode("choose"); setOnboardError(""); }}
              className="mt-3 text-xs text-[#8A7F85] hover:text-[#3D3539] transition-colors w-full text-center"
            >
              Back
            </button>
          </div>
        )}

        {onboardMode === "join" && (
          <div className="w-full max-w-xs">
            <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-5 space-y-3">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter join code"
                maxLength={6}
                className="w-full px-3 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all font-mono tracking-widest text-center"
              />
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="Your display name"
                className="w-full px-3 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
              />
              {onboardError && <p className="text-xs text-[#C97070]">{onboardError}</p>}
              <button
                onClick={handleJoin}
                disabled={onboardLoading || !joinCodeInput.trim() || !displayNameInput.trim()}
                className="w-full bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
              >
                {onboardLoading ? "Joining..." : "Join Library"}
              </button>
            </div>
            <button
              onClick={() => { setOnboardMode("choose"); setOnboardError(""); }}
              className="mt-3 text-xs text-[#8A7F85] hover:text-[#3D3539] transition-colors w-full text-center"
            >
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Search */}
      <div className="mb-4">
        <SearchBar onSearch={handleSearch} placeholder="Search your library..." />
      </div>

      {/* Person filter pills */}
      {members.length > 0 && books.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          <button
            onClick={() => handlePersonFilter(null)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
              personFilter === null
                ? "bg-[#B8A9D4] text-white"
                : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
            }`}
          >
            All
          </button>
          {members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => handlePersonFilter(m.user_id)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                personFilter === m.user_id
                  ? "bg-[#B8A9D4] text-white"
                  : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
              }`}
            >
              {m.display_name || "Unknown"}
            </button>
          ))}
        </div>
      )}

      {/* Read status filter pills */}
      {books.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          <button
            onClick={() => handleStatusFilter(null)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
              statusFilter === null
                ? "bg-[#B8A9D4] text-white"
                : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
            }`}
          >
            All
          </button>
          {(["unread", "reading", "read"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                statusFilter === s
                  ? "bg-[#B8A9D4] text-white"
                  : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {/* CSS art empty bookshelf */}
          <div className="mb-6 relative">
            <div className="w-48 h-32 relative">
              {/* Shelf boards */}
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#F0EBE6] rounded" />
              <div className="absolute bottom-12 left-0 right-0 h-2 bg-[#F0EBE6] rounded" />
              <div className="absolute bottom-24 left-0 right-0 h-2 bg-[#F0EBE6] rounded" />
              {/* Side panels */}
              <div className="absolute top-0 left-0 w-2 h-full bg-[#F0EBE6] rounded" />
              <div className="absolute top-0 right-0 w-2 h-full bg-[#F0EBE6] rounded" />
              {/* A few tilted books */}
              <div className="absolute bottom-2 left-6 w-3 h-9 bg-[#B8A9D4]/30 rounded-sm -rotate-6" />
              <div className="absolute bottom-2 left-12 w-4 h-8 bg-[#F5C6AA]/30 rounded-sm rotate-3" />
              {/* Decorative plant */}
              <div className="absolute bottom-14 right-6 w-3 h-6 bg-[#A8D5BA]/40 rounded-full" />
              <div className="absolute bottom-12 right-6 w-3 h-3 bg-[#A8D5BA]/30 rounded-sm" />
            </div>
          </div>
          <h2
            className="text-lg font-semibold mb-2 text-[#3D3539]"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            Your library is empty!
          </h2>
          <p className="text-[#8A7F85] text-sm mb-6 max-w-xs">
            Scan a book barcode to get started, or add one manually.
          </p>
          <div className="flex gap-3">
            <Link
              href="/library/scan"
              className="bg-[#B8A9D4] hover:bg-[#A898C7] text-white font-medium py-2.5 px-5 rounded-full transition-all duration-200 text-sm"
            >
              Scan a book
            </Link>
            <Link
              href="/library/add"
              className="bg-white hover:bg-[#F8F5F0] border border-[#F0EBE6] text-[#3D3539] font-medium py-2.5 px-5 rounded-full transition-all duration-200 text-sm"
            >
              Add manually
            </Link>
          </div>
        </div>
      )}

      {/* Search results info */}
      {searchQuery && books.length > 0 && (
        <p className="text-xs text-[#8A7F85] mb-3">
          {filteredBooks.length} result{filteredBooks.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* Book grid */}
      {filteredBooks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      {/* No search/filter results */}
      {(searchQuery || personFilter || statusFilter) && filteredBooks.length === 0 && books.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[#8A7F85] text-sm">
            No books match your {searchQuery ? "search" : "filters"}.
          </p>
        </div>
      )}

      {/* FAB */}
      {books.length > 0 && (
        <Link
          href="/library/add"
          className="fixed bottom-24 right-5 w-14 h-14 bg-[#B8A9D4] hover:bg-[#A898C7] active:bg-[#9B89BF] text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 z-30"
          aria-label="Add book"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </Link>
      )}
    </div>
  );
}
