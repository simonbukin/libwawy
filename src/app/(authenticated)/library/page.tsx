"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import { createLibrary, joinLibrary } from "@/lib/actions/library";
import BookCard from "@/components/book-card";
import SearchBar from "@/components/search-bar";
import Link from "next/link";
import type { BookWithEdition } from "@/lib/types/book";

interface EnrichedBook extends BookWithEdition {
  _memberColor?: string | null;
}

export default function LibraryPage() {
  const { libraryId, members, loading: ctxLoading } = useLibrary();
  const [books, setBooks] = useState<EnrichedBook[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<EnrichedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_searchQuery") || "";
    return "";
  });
  const [personFilter, setPersonFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_personFilter") || null;
    return null;
  });
  const [statusFilter, setStatusFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_statusFilter") || null;
    return null;
  });
  const [tagFilter, setTagFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_tagFilter") || null;
    return null;
  });
  const [sortBy, setSortBy] = useState<"added_at" | "title" | "author">(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("libwawy_library_sortBy");
      if (saved === "title" || saved === "author") return saved;
    }
    return "added_at";
  });
  const [loanedFilter, setLoanedFilter] = useState<boolean>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_loanedFilter") === "true";
    return false;
  });
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("libwawy_library_filtersOpen") === "true";
    return false;
  });

  // Onboarding state
  const [onboardMode, setOnboardMode] = useState<"choose" | "create" | "join">("choose");
  const [libName, setLibName] = useState("");
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
        // Build user_id → color map
        const colorMap = new Map<string, string | null>();
        for (const m of members) {
          if (m.user_id) {
            colorMap.set(m.user_id, m.color || null);
          }
        }
        // Enrich each book with added_by_name and member color
        const enriched = (data as BookWithEdition[]).map((book) => ({
          ...book,
          added_by_name: book.added_by ? memberMap.get(book.added_by) ?? null : null,
          _memberColor: book.added_by ? colorMap.get(book.added_by) ?? null : null,
        }));
        setBooks(enriched);

        // Apply restored filters using the shared helper
        const filtered = filterBooks(enriched, searchQuery, personFilter, statusFilter, tagFilter, sortBy, loanedFilter);
        setFilteredBooks(filtered);

        // Restore scroll position after DOM renders (double rAF for layout settle)
        const savedY = sessionStorage.getItem("libwawy_library_scrollY");
        if (savedY) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, parseInt(savedY, 10));
            });
          });
        }
      }
      setLoading(false);
    }

    if (!ctxLoading) {
      fetchBooks();
    }
  }, [libraryId, ctxLoading, members]);

  // Debounced scroll position saving
  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem("libwawy_library_scrollY", String(window.scrollY));
      }, 150);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Shared filter logic (pure function, no state dependency)
  const filterBooks = useCallback(
    (source: EnrichedBook[], query: string, person: string | null, status: string | null, tag: string | null, sort: "added_at" | "title" | "author", loaned: boolean) => {
      let result = source;
      if (person) result = result.filter((b) => b.added_by === person);
      if (status) result = result.filter((b) => b.read_status === status);
      if (loaned) result = result.filter((b) => b.loaned_to);
      if (tag) result = result.filter((b) => b.tags?.includes(tag));
      if (query.trim()) {
        const lower = query.toLowerCase();
        result = result.filter(
          (b) =>
            b.book_editions.title.toLowerCase().includes(lower) ||
            b.book_editions.authors?.some((a) => a.toLowerCase().includes(lower)) ||
            b.book_editions.isbn_13?.includes(query) ||
            b.book_editions.isbn_10?.includes(query)
        );
      }
      if (sort === "title") {
        result = [...result].sort((a, b) => a.book_editions.title.localeCompare(b.book_editions.title));
      } else if (sort === "author") {
        result = [...result].sort((a, b) => (a.book_editions.authors?.[0] || "").localeCompare(b.book_editions.authors?.[0] || ""));
      }
      return result;
    },
    []
  );

  // Combined filter: applies to current books state
  const applyFilters = useCallback(
    (query: string, person: string | null, status: string | null, tag: string | null, sort: "added_at" | "title" | "author" = sortBy, loaned: boolean = loanedFilter) => {
      setFilteredBooks(filterBooks(books, query, person, status, tag, sort, loaned));
    },
    [books, sortBy, loanedFilter, filterBooks]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      sessionStorage.setItem("libwawy_library_searchQuery", query);
      applyFilters(query, personFilter, statusFilter, tagFilter, sortBy, loanedFilter);
    },
    [applyFilters, personFilter, statusFilter, tagFilter, sortBy, loanedFilter]
  );

  const handlePersonFilter = useCallback(
    (userId: string | null) => {
      setPersonFilter(userId);
      if (userId) sessionStorage.setItem("libwawy_library_personFilter", userId);
      else sessionStorage.removeItem("libwawy_library_personFilter");
      applyFilters(searchQuery, userId, statusFilter, tagFilter, sortBy, loanedFilter);
    },
    [applyFilters, searchQuery, statusFilter, tagFilter, sortBy, loanedFilter]
  );

  const handleStatusFilter = useCallback(
    (status: string | null) => {
      setStatusFilter(status);
      if (status) sessionStorage.setItem("libwawy_library_statusFilter", status);
      else sessionStorage.removeItem("libwawy_library_statusFilter");
      applyFilters(searchQuery, personFilter, status, tagFilter, sortBy, loanedFilter);
    },
    [applyFilters, searchQuery, personFilter, tagFilter, sortBy, loanedFilter]
  );

  const handleTagFilter = useCallback(
    (tag: string | null) => {
      setTagFilter(tag);
      if (tag) sessionStorage.setItem("libwawy_library_tagFilter", tag);
      else sessionStorage.removeItem("libwawy_library_tagFilter");
      applyFilters(searchQuery, personFilter, statusFilter, tag, sortBy, loanedFilter);
    },
    [applyFilters, searchQuery, personFilter, statusFilter, sortBy, loanedFilter]
  );

  const handleSort = useCallback(
    (sort: "added_at" | "title" | "author") => {
      setSortBy(sort);
      sessionStorage.setItem("libwawy_library_sortBy", sort);
      applyFilters(searchQuery, personFilter, statusFilter, tagFilter, sort, loanedFilter);
    },
    [applyFilters, searchQuery, personFilter, statusFilter, tagFilter, loanedFilter]
  );

  const handleLoanedFilter = useCallback(
    (loaned: boolean) => {
      setLoanedFilter(loaned);
      sessionStorage.setItem("libwawy_library_loanedFilter", String(loaned));
      applyFilters(searchQuery, personFilter, statusFilter, tagFilter, sortBy, loaned);
    },
    [applyFilters, searchQuery, personFilter, statusFilter, tagFilter, sortBy]
  );

  const allTags = useMemo(() => [...new Set(books.flatMap((b) => b.tags || []))].sort(), [books]);

  if (loading || ctxLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
          <span className="text-muted text-sm">Loading books...</span>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!libName.trim()) return;
    setOnboardLoading(true);
    setOnboardError("");
    const result = await createLibrary(libName.trim());
    if (result.error) {
      setOnboardError(result.error);
      setOnboardLoading(false);
    } else {
      window.location.reload();
    }
  };

  const handleJoin = async () => {
    if (!joinCodeInput.trim()) return;
    setOnboardLoading(true);
    setOnboardError("");
    const result = await joinLibrary(joinCodeInput.trim());
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
        <div className="w-16 h-16 rounded-2xl bg-lavender/15 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B8A9D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          Welcome to libwawy
        </h2>
        <p className="text-muted text-sm mb-8 text-center max-w-xs">
          Create a new shared library or join an existing one.
        </p>

        {onboardMode === "choose" && (
          <div className="w-full max-w-xs flex flex-col gap-3">
            <button
              onClick={() => setOnboardMode("create")}
              className="w-full bg-lavender hover:bg-lavender-hover text-white font-medium py-3 rounded-2xl transition-all text-sm"
            >
              Create a Library
            </button>
            <button
              onClick={() => setOnboardMode("join")}
              className="w-full bg-card hover:bg-hover border border-border text-charcoal font-medium py-3 rounded-2xl transition-all text-sm"
            >
              Join with Code
            </button>
          </div>
        )}

        {onboardMode === "create" && (
          <div className="w-full max-w-xs">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
              <input
                type="text"
                value={libName}
                onChange={(e) => setLibName(e.target.value)}
                placeholder="Library name (e.g. Our Bookshelf)"
                className="w-full px-3 py-2.5 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all"
              />
              {onboardError && <p className="text-xs text-red">{onboardError}</p>}
              <button
                onClick={handleCreate}
                disabled={onboardLoading || !libName.trim()}
                className="w-full bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
              >
                {onboardLoading ? "Creating..." : "Create Library"}
              </button>
            </div>
            <button
              onClick={() => { setOnboardMode("choose"); setOnboardError(""); }}
              className="mt-3 text-xs text-muted hover:text-charcoal transition-colors w-full text-center"
            >
              Back
            </button>
          </div>
        )}

        {onboardMode === "join" && (
          <div className="w-full max-w-xs">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter join code"
                maxLength={6}
                className="w-full px-3 py-2.5 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all font-mono tracking-widest text-center"
              />
              {onboardError && <p className="text-xs text-red">{onboardError}</p>}
              <button
                onClick={handleJoin}
                disabled={onboardLoading || !joinCodeInput.trim()}
                className="w-full bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
              >
                {onboardLoading ? "Joining..." : "Join Library"}
              </button>
            </div>
            <button
              onClick={() => { setOnboardMode("choose"); setOnboardError(""); }}
              className="mt-3 text-xs text-muted hover:text-charcoal transition-colors w-full text-center"
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
      {/* Search + Sort */}
      <div className="mb-4 flex gap-2 items-start">
        <div className="flex-1">
          <SearchBar onSearch={handleSearch} placeholder="Search your library..." initialValue={searchQuery} />
        </div>
      </div>

      {/* Unified filter bar */}
      {books.length > 0 && (() => {
        const activeFilterCount =
          (personFilter ? 1 : 0) +
          (statusFilter ? 1 : 0) +
          (tagFilter ? 1 : 0) +
          (loanedFilter ? 1 : 0) +
          (sortBy !== "added_at" ? 1 : 0);

        const filterSummaryParts: string[] = [];
        if (statusFilter) filterSummaryParts.push(statusFilter === "dnf" ? "DNF" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1));
        if (loanedFilter) filterSummaryParts.push("Loaned");
        if (personFilter) {
          const member = members.find((m) => m.user_id === personFilter);
          if (member) filterSummaryParts.push(member.display_name || "Member");
        }
        if (tagFilter) filterSummaryParts.push(tagFilter);
        if (sortBy !== "added_at") filterSummaryParts.push(`Sorted by ${sortBy === "title" ? "Title" : "Author"}`);

        const handleClearAll = () => {
          handlePersonFilter(null);
          handleStatusFilter(null);
          handleTagFilter(null);
          handleLoanedFilter(false);
          handleSort("added_at");
        };

        const toggleFiltersOpen = () => {
          const next = !filtersOpen;
          setFiltersOpen(next);
          sessionStorage.setItem("libwawy_library_filtersOpen", String(next));
        };

        return (
          <div className="mb-4" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            {/* Filter toggle button */}
            <button
              onClick={toggleFiltersOpen}
              className="flex items-center gap-2 text-sm font-medium text-muted hover:text-charcoal transition-colors mb-2"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="11" y1="18" x2="13" y2="18" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-lavender text-white">
                  {activeFilterCount}
                </span>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-300 ${filtersOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Active filter summary (when collapsed) */}
            {!filtersOpen && activeFilterCount > 0 && (
              <p className="text-xs text-muted mb-2">{filterSummaryParts.join(" \u00b7 ")}</p>
            )}

            {/* Collapsible filter section */}
            <div
              className={`overflow-hidden transition-all duration-300 ${filtersOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
                {/* Sort row */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5 block">Sort</label>
                  <div className="flex bg-cream border border-border rounded-xl p-0.5 w-fit">
                    {([
                      { value: "added_at", label: "Recent" },
                      { value: "title", label: "Title" },
                      { value: "author", label: "Author" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleSort(opt.value)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                          sortBy === opt.value
                            ? "bg-lavender text-white shadow-sm"
                            : "text-muted hover:text-charcoal"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status row */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5 block">Status</label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => { handleStatusFilter(null); if (loanedFilter) handleLoanedFilter(false); }}
                      className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                        statusFilter === null && !loanedFilter
                          ? "bg-lavender text-white"
                          : "bg-card border border-border text-muted"
                      }`}
                    >
                      All
                    </button>
                    {(["unread", "reading", "read", "dnf"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusFilter(s)}
                        className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                          statusFilter === s
                            ? "bg-lavender text-white"
                            : "bg-card border border-border text-muted"
                        }`}
                      >
                        {s === "dnf" ? "DNF" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                    <button
                      onClick={() => handleLoanedFilter(!loanedFilter)}
                      className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                        loanedFilter
                          ? "bg-pink text-white"
                          : "bg-card border border-border text-muted"
                      }`}
                    >
                      Loaned
                    </button>
                  </div>
                </div>

                {/* Person row */}
                {members.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5 block">Person</label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                      <button
                        onClick={() => handlePersonFilter(null)}
                        className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                          personFilter === null
                            ? "bg-lavender text-white"
                            : "bg-card border border-border text-muted"
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
                              ? "bg-lavender text-white"
                              : "bg-card border border-border text-muted"
                          }`}
                        >
                          {m.display_name || "Unknown"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags row */}
                {allTags.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1.5 block">Tags</label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                      <button
                        onClick={() => handleTagFilter(null)}
                        className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                          tagFilter === null
                            ? "bg-slate text-white"
                            : "bg-card border border-border text-muted"
                        }`}
                      >
                        All Tags
                      </button>
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => handleTagFilter(tag)}
                          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                            tagFilter === tag
                              ? "bg-slate text-white"
                              : "bg-slate-light/30 text-slate border border-slate-light/50"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs font-medium text-red hover:text-red-dark transition-colors pt-1"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {books.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {/* CSS art empty bookshelf */}
          <div className="mb-6 relative">
            <div className="w-48 h-32 relative">
              {/* Shelf boards */}
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-border rounded" />
              <div className="absolute bottom-12 left-0 right-0 h-2 bg-border rounded" />
              <div className="absolute bottom-24 left-0 right-0 h-2 bg-border rounded" />
              {/* Side panels */}
              <div className="absolute top-0 left-0 w-2 h-full bg-border rounded" />
              <div className="absolute top-0 right-0 w-2 h-full bg-border rounded" />
              {/* A few tilted books */}
              <div className="absolute bottom-2 left-6 w-3 h-9 bg-lavender/30 rounded-sm -rotate-6" />
              <div className="absolute bottom-2 left-12 w-4 h-8 bg-peach/30 rounded-sm rotate-3" />
              {/* Decorative plant */}
              <div className="absolute bottom-14 right-6 w-3 h-6 bg-mint/40 rounded-full" />
              <div className="absolute bottom-12 right-6 w-3 h-3 bg-mint/30 rounded-sm" />
            </div>
          </div>
          <h2
            className="text-lg font-semibold mb-2 text-charcoal"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            Your library is empty!
          </h2>
          <p className="text-muted text-sm mb-6 max-w-xs">
            Scan a book barcode to get started, or add one manually.
          </p>
          <div className="flex gap-3">
            <Link
              href="/library/scan"
              className="bg-lavender hover:bg-lavender-hover text-white font-medium py-2.5 px-5 rounded-full transition-all duration-200 text-sm"
            >
              Scan a book
            </Link>
            <Link
              href="/library/add"
              className="bg-card hover:bg-hover border border-border text-charcoal font-medium py-2.5 px-5 rounded-full transition-all duration-200 text-sm"
            >
              Add manually
            </Link>
          </div>
        </div>
      )}

      {/* Search results info */}
      {searchQuery && books.length > 0 && (
        <p className="text-xs text-muted mb-3">
          {filteredBooks.length} result{filteredBooks.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* Book grid */}
      {filteredBooks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredBooks.map((book, index) => (
            <div
              key={book.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(index, 12) * 30}ms`, animationFillMode: 'backwards' }}
            >
              <BookCard book={book} memberColor={book._memberColor} />
            </div>
          ))}
        </div>
      )}

      {/* No search/filter results */}
      {(searchQuery || personFilter || statusFilter || tagFilter || loanedFilter) && filteredBooks.length === 0 && books.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted text-sm">
            No books match your {searchQuery ? "search" : "filters"}.
          </p>
        </div>
      )}

      {/* FAB */}
      <Link
        href="/library/add"
        className="fixed bottom-24 right-5 w-14 h-14 bg-lavender hover:bg-lavender-hover active:bg-lavender-dark text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 z-30"
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
    </div>
  );
}
