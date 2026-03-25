"use client";

import { useState, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Scanner from "@/components/scanner";
import Link from "next/link";
import type { BookEdition, BookWithEdition, WishlistWithEdition } from "@/lib/types/book";
// lookupByIsbn is dynamically imported in lookupIsbn callback

type ScanState = "scanning" | "looking_up" | "result" | "already_owned" | "on_wishlist" | "error" | "added";

export default function ScanPage() {
  const { libraryId, members } = useLibrary();
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [scannedIsbn, setScannedIsbn] = useState<string>("");
  const [edition, setEdition] = useState<BookEdition | null>(null);
  const [existingBook, setExistingBook] = useState<BookWithEdition | null>(null);
  const [wishlistMatch, setWishlistMatch] = useState<WishlistWithEdition | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [adding, setAdding] = useState(false);
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
        const { lookupByIsbn } = await import("@/lib/services/book-lookup");
        const lookedUp = await lookupByIsbn(isbn, supabase);

        if (!lookedUp) {
          setScanState("error");
          setErrorMessage("Book not found. Try adding it manually.");
          return;
        }

        setEdition(lookedUp);
        const existingEdition = lookedUp;

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

        // Check wishlists
        const { data: wishlistItem } = await supabase
          .from("wishlists")
          .select("*, book_editions(*)")
          .eq("library_id", libraryId)
          .eq("edition_id", existingEdition.id)
          .is("fulfilled_at", null)
          .limit(1)
          .single();

        if (wishlistItem) {
          setWishlistMatch(wishlistItem as WishlistWithEdition);
        }

        setScanState("result");
      } catch {
        setScanState("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    },
    [libraryId]
  );

  const handleAddToLibrary = async () => {
    if (!libraryId || !edition) return;
    setAdding(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("library_books").insert({
      library_id: libraryId,
      edition_id: edition.id,
      added_by: user?.id || null,
      condition: "good",
      read_status: "unread",
    });

    // If this was on someone's wishlist, mark it fulfilled
    if (wishlistMatch) {
      await supabase
        .from("wishlists")
        .update({ fulfilled_at: new Date().toISOString() })
        .eq("id", wishlistMatch.id);
    }

    setAdding(false);

    if (!error) {
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
    setExistingBook(null);
    setWishlistMatch(null);
    setErrorMessage("");
  };

  const getWishlistOwnerName = () => {
    if (!wishlistMatch) return "Someone";
    const member = members.find((m) => m.user_id === wishlistMatch.user_id);
    return member?.display_name || "Someone";
  };

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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
            <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F5C6AA]/15 flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#3D3539] mb-1">Camera not available</p>
              <p className="text-xs text-[#8A7F85] mb-4">
                Check your browser&apos;s camera permissions, or type the ISBN manually below.
              </p>
            </div>
          ) : (
            <p className="text-center text-[#8A7F85] text-xs mt-3">
              Point your camera at a book&apos;s barcode
            </p>
          )}

          {/* Manual ISBN fallback — always visible */}
          <div className="mt-4 bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4">
            <p className="text-xs text-[#8A7F85] mb-2">
              {cameraFailed ? "Enter ISBN manually:" : "Or enter ISBN manually:"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value.replace(/[^0-9Xx-]/g, ""))}
                placeholder="978-0-123456-78-9"
                className="flex-1 px-3 py-2.5 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all font-mono"
              />
              <button
                onClick={() => {
                  const cleaned = manualIsbn.replace(/[^0-9X]/gi, "");
                  if (cleaned.length === 10 || cleaned.length === 13) {
                    lookupIsbn(cleaned);
                  }
                }}
                disabled={!manualIsbn.replace(/[^0-9X]/gi, "").match(/^.{10,13}$/)}
                className="bg-[#B8A9D4] hover:bg-[#A898C7] disabled:opacity-40 text-white font-medium py-2.5 px-5 rounded-full transition-all text-sm whitespace-nowrap"
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
          <div className="w-10 h-10 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
          <p className="text-[#8A7F85] text-sm">Looking up ISBN {scannedIsbn}...</p>
        </div>
      )}

      {/* Already owned */}
      {scanState === "already_owned" && existingBook && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#F5C6AA]/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Already in your library!
          </h2>
          <p className="text-[#8A7F85] text-sm mb-4">
            {existingBook.book_editions.title} by{" "}
            {existingBook.book_editions.authors?.join(", ")}
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href={`/library/book/${existingBook.id}`}
              className="bg-[#B8A9D4] hover:bg-[#A898C7] text-white font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              View Book
            </Link>
            <button
              onClick={handleScanAnother}
              className="bg-white hover:bg-[#F8F5F0] border border-[#F0EBE6] text-[#3D3539] font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Scan Another
            </button>
          </div>
        </div>
      )}

      {/* Result - ready to add */}
      {(scanState === "result") && edition && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm overflow-hidden">
          <div className="flex gap-4 p-4">
            {/* Cover */}
            <div className="w-20 h-28 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
              {edition.cover_url ? (
                <img
                  src={edition.cover_url}
                  alt={edition.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#B8A9D4]/20">
                  <span className="text-[#B8A9D4] text-2xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                    {edition.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[#3D3539] line-clamp-2 mb-0.5" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                {edition.title}
              </h3>
              {edition.subtitle && (
                <p className="text-xs text-[#8A7F85] line-clamp-1 mb-1">
                  {edition.subtitle}
                </p>
              )}
              <p className="text-sm text-[#8A7F85]">
                {edition.authors?.join(", ") || "Unknown author"}
              </p>
              {edition.published_year && (
                <p className="text-xs text-[#8A7F85] mt-0.5">
                  {edition.publisher ? `${edition.publisher}, ` : ""}
                  {edition.published_year}
                </p>
              )}
            </div>
          </div>

          {/* Wishlist match banner */}
          {wishlistMatch && (
            <div className="mx-4 mb-3 bg-[#E8B4C8]/15 border border-[#E8B4C8]/30 rounded-xl px-3 py-2 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#E8B4C8" stroke="#E8B4C8" strokeWidth="1.5">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              <span className="text-xs text-[#3D3539]">
                On <strong>{getWishlistOwnerName()}&apos;s</strong> wishlist!
              </span>
            </div>
          )}

          {/* Action */}
          <div className="px-4 pb-4">
            <button
              onClick={handleAddToLibrary}
              disabled={adding}
              className="w-full bg-[#B8A9D4] hover:bg-[#A898C7] active:bg-[#9B89BF] disabled:opacity-60 text-white font-medium py-3 rounded-full transition-all text-sm"
            >
              {adding ? "Adding..." : "Add to Library"}
            </button>
          </div>
        </div>
      )}

      {/* Added success */}
      {scanState === "added" && edition && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#A8D5BA]/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Added!
          </h2>
          <p className="text-[#8A7F85] text-sm mb-4">
            {edition.title} is now in your library.
          </p>
          <button
            onClick={handleScanAnother}
            className="bg-[#B8A9D4] hover:bg-[#A898C7] text-white font-medium py-2.5 px-6 rounded-full transition-all text-sm"
          >
            Scan Another
          </button>
        </div>
      )}

      {/* Error */}
      {scanState === "error" && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#F5C6AA]/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4956F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Oops!
          </h2>
          <p className="text-[#8A7F85] text-sm mb-4">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleScanAnother}
              className="bg-[#B8A9D4] hover:bg-[#A898C7] text-white font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Try Again
            </button>
            <Link
              href="/library/add"
              className="bg-white hover:bg-[#F8F5F0] border border-[#F0EBE6] text-[#3D3539] font-medium py-2 px-5 rounded-full transition-all text-sm"
            >
              Add Manually
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
