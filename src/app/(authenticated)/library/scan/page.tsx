"use client";

import { useState, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Scanner from "@/components/scanner";
import Link from "next/link";
import ProviderBadge from "@/components/provider-badge";
import type { BookEdition, BookWithEdition } from "@/lib/types/book";

interface ListMatch {
  listName: string;
  ownerName: string;
}

interface SimilarBook {
  id: string;
  title: string;
  authors: string[];
}

type ScanState = "scanning" | "looking_up" | "result" | "already_owned" | "similar_found" | "error" | "added";

export default function ScanPage() {
  const { libraryId, members } = useLibrary();
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [scannedIsbn, setScannedIsbn] = useState<string>("");
  const [edition, setEdition] = useState<BookEdition | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [existingBook, setExistingBook] = useState<BookWithEdition | null>(null);
  const [listMatches, setListMatches] = useState<ListMatch[]>([]);
  const [similarBook, setSimilarBook] = useState<SimilarBook | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedBookId, setAddedBookId] = useState<string | null>(null);
  const [manualIsbn, setManualIsbn] = useState("");
  const [cameraFailed, setCameraFailed] = useState(false);

  const lookupIsbn = useCallback(
    async (isbn: string) => {
      if (!libraryId) return;
      setScannedIsbn(isbn);
      setScanState("looking_up");

      const supabase = createClient();

      try {
        // Use the centralized lookup service (checks DB cache, then multi-source API chain)
        const { lookupByIsbnWithProviders } = await import("@/lib/services/book-lookup");
        const result = await lookupByIsbnWithProviders(isbn, supabase);

        if (!result) {
          setScanState("error");
          setErrorMessage("Book not found. Try adding it manually.");
          return;
        }

        setEdition(result.edition);
        setProviders(result.providers);
        const existingEdition = result.edition;

        // Check if already in library
        const { data: libraryBook } = await supabase
          .from("library_books")
          .select("*, book_editions(*)")
          .eq("library_id", libraryId)
          .eq("edition_id", existingEdition.id)
          .is("removed_at", null)
          .limit(1)
          .single();

        if (libraryBook) {
          setExistingBook(libraryBook as BookWithEdition);
          setScanState("already_owned");
          return;
        }

        // Check if on any member's list
        const { data: listItems } = await supabase
          .from("list_items")
          .select("list_id, lists(name, user_id)")
          .eq("edition_id", existingEdition.id)
          .limit(5);

        if (listItems && listItems.length > 0) {
          const matches: ListMatch[] = listItems
            .filter((li: Record<string, unknown>) => li.lists)
            .map((li: Record<string, unknown>) => {
              const listData = li.lists as { name: string; user_id: string };
              const member = members.find((m) => m.user_id === listData.user_id);
              return {
                listName: listData.name,
                ownerName: member?.display_name || "Someone",
              };
            });
          setListMatches(matches);
        }

        // Title-based similar book check (Phase 5)
        const baseTitle = existingEdition.title.split(":")[0].trim().toLowerCase();
        const { data: similarBooks } = await supabase
          .from("library_books")
          .select("id, book_editions(title, authors)")
          .eq("library_id", libraryId)
          .is("removed_at", null);

        if (similarBooks) {
          const similar = similarBooks.find((sb: Record<string, unknown>) => {
            const ed = sb.book_editions as { title: string; authors: string[] } | null;
            if (!ed) return false;
            const sbBaseTitle = ed.title.split(":")[0].trim().toLowerCase();
            return sbBaseTitle === baseTitle;
          });
          if (similar) {
            const ed = similar.book_editions as unknown as { title: string; authors: string[] };
            setSimilarBook({ id: similar.id as string, title: ed.title, authors: ed.authors || [] });
            setScanState("similar_found");
            return;
          }
        }

        setScanState("result");
      } catch {
        setScanState("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    },
    [libraryId, members]
  );

  const handleAddToLibrary = async () => {
    if (!libraryId || !edition) return;
    setAdding(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: insertedBook, error } = await supabase.from("library_books").insert({
      library_id: libraryId,
      edition_id: edition.id,
      added_by: user?.id || null,
      condition: "good",
      read_status: "unread",
    }).select("id").single();

    setAdding(false);

    if (!error && insertedBook) {
      setAddedBookId(insertedBook.id);
      setScanState("added");
    } else {
      setErrorMessage("Failed to add book. Please try again.");
      setScanState("error");
    }
  };

  const handleScanAnother = () => {
    setScanState("scanning");
    setScannedIsbn("");
    setEdition(null);
    setProviders([]);
    setExistingBook(null);
    setListMatches([]);
    setSimilarBook(null);
    setErrorMessage("");
    setAddedBookId(null);
    setAdding(false);
    setCameraFailed(false);
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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
          Scan Barcode
        </h1>
      </div>

      {/* Scanner */}
      {scanState === "scanning" && (
        <div>
          {!cameraFailed && (
            <Scanner
              onScan={lookupIsbn}
              onError={() => setCameraFailed(true)}
            />
          )}

          {cameraFailed ? (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-peach/15 flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm font-medium text-charcoal mb-1">Camera not available</p>
              <p className="text-xs text-muted mb-4">
                Check your browser&apos;s camera permissions, or type the ISBN manually below.
              </p>
            </div>
          ) : (
            <p className="text-center text-muted text-xs mt-3">
              Point your camera at a book&apos;s barcode
            </p>
          )}

          {/* Manual ISBN fallback — always visible */}
          <div className="mt-4 bg-card rounded-2xl border border-border shadow-sm p-4">
            <p className="text-xs text-muted mb-2">
              {cameraFailed ? "Enter ISBN manually:" : "Or enter ISBN manually:"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value.replace(/[^0-9Xx-]/g, ""))}
                placeholder="978-0-123456-78-9"
                className="flex-1 px-3 py-2.5 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all font-mono"
              />
              <button
                onClick={() => {
                  const cleaned = manualIsbn.replace(/[^0-9X]/gi, "");
                  if (cleaned.length === 10 || cleaned.length === 13) {
                    lookupIsbn(cleaned);
                  }
                }}
                disabled={!manualIsbn.replace(/[^0-9X]/gi, "").match(/^.{10,13}$/)}
                className="bg-lavender hover:bg-lavender-hover disabled:opacity-40 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
              >
                Look up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Looking up */}
      {scanState === "looking_up" && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
          <p className="text-muted text-sm">Looking up ISBN {scannedIsbn}...</p>
        </div>
      )}

      {/* Already owned */}
      {scanState === "already_owned" && existingBook && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-peach/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Already in your library!
          </h2>
          <p className="text-muted text-sm mb-4">
            {existingBook.book_editions.title} by{" "}
            {existingBook.book_editions.authors?.join(", ")}
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href={`/library/book/${existingBook.id}`}
              className="bg-lavender hover:bg-lavender-hover text-white font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              View Book
            </Link>
            <button
              onClick={handleScanAnother}
              className="bg-card hover:bg-hover border border-border text-charcoal font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}

      {/* Result - ready to add */}
      {(scanState === "result") && edition && (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex gap-4 p-4">
            {/* Cover */}
            <div className="w-20 h-28 rounded-lg overflow-hidden bg-hover flex-shrink-0">
              {edition.cover_url ? (
                <img
                  src={edition.cover_url}
                  alt={edition.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-lavender/20">
                  <span className="text-lavender text-2xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                    {edition.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-charcoal line-clamp-2 mb-0.5" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                {edition.title}
              </h3>
              {edition.subtitle && (
                <p className="text-xs text-muted line-clamp-1 mb-1">
                  {edition.subtitle}
                </p>
              )}
              <p className="text-sm text-muted">
                {edition.authors?.join(", ") || "Unknown author"}
              </p>
              {edition.published_year && (
                <p className="text-xs text-muted mt-0.5">
                  {edition.publisher ? `${edition.publisher}, ` : ""}
                  {edition.published_year}
                </p>
              )}
              {providers.length > 0 && (
                <div className="mt-1.5">
                  <ProviderBadge providers={providers} />
                </div>
              )}
            </div>
          </div>

          {/* List match banner */}
          {listMatches.length > 0 && (
            <div className="mx-4 mb-3 bg-pink/15 border border-pink/30 rounded-xl px-3 py-2 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8B4C8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h13" />
                <path d="M8 12h13" />
                <path d="M3 6h.01" />
                <path d="M3 12h.01" />
              </svg>
              <span className="text-xs text-charcoal">
                On <strong>{listMatches[0].ownerName}&apos;s</strong> {listMatches[0].listName}!
              </span>
            </div>
          )}

          {/* Action */}
          <div className="px-4 pb-4">
            <button
              onClick={handleAddToLibrary}
              disabled={adding}
              className="w-full bg-lavender hover:bg-lavender-hover active:bg-lavender-dark disabled:opacity-60 text-white font-medium py-3 rounded-full transition-all text-sm"
            >
              {adding ? "Adding..." : "Add to Library"}
            </button>
          </div>
        </div>
      )}

      {/* Similar book found */}
      {scanState === "similar_found" && edition && similarBook && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="w-12 h-12 rounded-full bg-peach/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1 text-center" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Similar book found
          </h2>
          <p className="text-muted text-sm mb-2 text-center">
            A similar book may already be in your library:
          </p>
          <div className="bg-hover rounded-xl px-3 py-2 mb-4">
            <p className="text-sm font-medium text-charcoal">{similarBook.title}</p>
            <p className="text-xs text-muted">{similarBook.authors?.join(", ")}</p>
            <p className="text-xs text-muted italic mt-0.5">Different edition</p>
          </div>
          <p className="text-sm text-charcoal mb-1 text-center font-medium">
            You&apos;re adding: {edition.title}
          </p>
          <p className="text-xs text-muted mb-4 text-center">
            {edition.authors?.join(", ")}
          </p>
          <div className="flex gap-3">
            <Link
              href={`/library/book/${similarBook.id}`}
              className="flex-1 py-2.5 text-center bg-card hover:bg-hover border border-border text-charcoal text-sm font-medium rounded-full transition-all"
            >
              View Existing
            </Link>
            <button
              onClick={handleAddToLibrary}
              disabled={adding}
              className="flex-1 py-2.5 bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white text-sm font-medium rounded-full transition-all"
            >
              {adding ? "Adding..." : "Add Anyway"}
            </button>
          </div>
        </div>
      )}

      {/* Added success */}
      {scanState === "added" && edition && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded-full bg-mint/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Added!
          </h2>
          <p className="text-muted text-sm mb-4">
            {edition.title} is now in your library.
          </p>
          <div className="flex gap-3 justify-center">
            {addedBookId && (
              <Link
                href={`/library/book/${addedBookId}/edit`}
                className="bg-lavender hover:bg-lavender-hover text-white font-medium py-2.5 px-6 rounded-full transition-all text-sm"
              >
                Edit Entry
              </Link>
            )}
            <button
              onClick={handleScanAnother}
              className="bg-card hover:bg-hover border border-border text-charcoal font-medium py-2.5 px-6 rounded-full transition-all text-sm"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {scanState === "error" && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center animate-fade-in-up">
          <div className="w-12 h-12 rounded-full bg-peach/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Oops!
          </h2>
          <p className="text-muted text-sm mb-4">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleScanAnother}
              className="bg-lavender hover:bg-lavender-hover text-white font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Try Again
            </button>
            <Link
              href="/library/add"
              className="bg-card hover:bg-hover border border-border text-charcoal font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Add Manually
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
