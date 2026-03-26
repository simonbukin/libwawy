"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { BookWithEdition, List } from "@/lib/types/book";
import { getAvatarColor } from "@/lib/utils/avatar";

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  read: { bg: "bg-lavender/15", text: "text-lavender-dark", label: "Read" },
  reading: { bg: "bg-peach/20", text: "text-peach-dark", label: "Reading" },
  unread: { bg: "bg-border", text: "text-muted", label: "Unread" },
  dnf: { bg: "bg-red/10", text: "text-red", label: "DNF" },
};

const placeholderColors = [
  "bg-lavender",
  "bg-mint",
  "bg-peach",
  "bg-pink",
];

interface ReaderInfo {
  display_name: string;
  color: string | null;
  read_status: string;
}

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { members, userId, libraryId } = useLibrary();
  const bookId = params.id as string;

  const [book, setBook] = useState<BookWithEdition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [userLists, setUserLists] = useState<List[]>([]);
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [listSuccess, setListSuccess] = useState("");
  const [readers, setReaders] = useState<ReaderInfo[]>([]);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const cancelListRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowRemoveModal(false);
        setShowListModal(false);
      }
    };
    if (showRemoveModal || showListModal) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [showRemoveModal, showListModal]);

  useEffect(() => {
    if (showRemoveModal) cancelRemoveRef.current?.focus();
  }, [showRemoveModal]);

  useEffect(() => {
    if (showListModal) cancelListRef.current?.focus();
  }, [showListModal]);

  useEffect(() => {
    async function fetchBook() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("library_books")
        .select("*, book_editions(*)")
        .eq("id", bookId)
        .single();

      if (!error && data) {
        const bookData = data as BookWithEdition;
        setBook(bookData);

        // Fetch readers of the same edition
        const { data: otherCopies } = await supabase
          .from("library_books")
          .select("read_status, added_by")
          .eq("edition_id", bookData.edition_id)
          .eq("library_id", bookData.library_id)
          .is("removed_at", null)
          .in("read_status", ["read", "reading"]);

        if (otherCopies && otherCopies.length > 0) {
          const readerInfos: ReaderInfo[] = [];
          for (const copy of otherCopies) {
            const member = members.find((m) => m.user_id === copy.added_by);
            if (member) {
              readerInfos.push({
                display_name: member.display_name || "Member",
                color: member.color || null,
                read_status: copy.read_status,
              });
            }
          }
          setReaders(readerInfos);
        }
      }
      setLoading(false);
    }
    fetchBook();
  }, [bookId, members]);

  const handleRemove = async () => {
    setRemoving(true);
    const supabase = createClient();
    await supabase
      .from("library_books")
      .update({
        removed_at: new Date().toISOString(),
        removed_reason: removeReason || null,
      })
      .eq("id", bookId);
    setRemoving(false);
    router.push("/library");
  };

  const openListModal = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("lists")
      .select("*")
      .eq("user_id", userId!)
      .order("created_at");
    if (data) setUserLists(data as List[]);
    setShowListModal(true);
  };

  const handleAddToList = async (listId: string) => {
    if (!book) return;
    setAddingToList(listId);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("list_items")
      .select("id")
      .eq("list_id", listId)
      .eq("edition_id", book.edition_id)
      .limit(1)
      .single();

    if (existing) {
      setListSuccess("Already on this list!");
    } else {
      await supabase.from("list_items").insert({
        list_id: listId,
        edition_id: book.edition_id,
        library_book_id: book.id,
      });
      const listName = userLists.find((l) => l.id === listId)?.name || "list";
      setListSuccess(`Added to ${listName}!`);
    }
    setAddingToList(null);
    setTimeout(() => {
      setListSuccess("");
      setShowListModal(false);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-muted">Book not found.</p>
        <Link href="/library" className="text-lavender text-sm mt-2 inline-block">
          Back to library
        </Link>
      </div>
    );
  }

  const edition = book.book_editions;
  const colorIdx = edition.title.charCodeAt(0) % placeholderColors.length;
  const status = statusColors[book.read_status] || statusColors.unread;

  return (
    <div className="px-4 py-4 pb-8 animate-fade-in">
      {/* Back button */}
      <div className="mb-4">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-charcoal transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Link>
      </div>

      {/* Cover + basic info */}
      <div className="flex gap-4 mb-6">
        <div className="w-28 h-40 rounded-xl overflow-hidden shadow-md flex-shrink-0">
          {edition.cover_url ? (
            <img src={edition.cover_url} alt={edition.title} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${placeholderColors[colorIdx]}`}>
              <span className="text-white/90 text-4xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                {edition.title.charAt(0)}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-xl font-bold text-charcoal leading-tight mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            {edition.title}
          </h1>
          {edition.subtitle && <p className="text-sm text-muted mb-1">{edition.subtitle}</p>}
          <p className="text-sm text-muted mb-2">{edition.authors?.join(", ") || "Unknown author"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {edition.publisher && <span>{edition.publisher}</span>}
            {edition.published_year && <span>{edition.published_year}</span>}
            {edition.page_count && <span>{edition.page_count} pages</span>}
            {edition.format && <span>{edition.format}</span>}
          </div>
        </div>
      </div>

      {/* Loan banner — prominent */}
      {book.loaned_to && (
        <div className="bg-pink/20 border-2 border-pink/40 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-pink/30 flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4819E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              <path d="m9 10 2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-charcoal" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Loaned to {book.loaned_to}
            </p>
            {book.loaned_at && (
              <p className="text-xs text-muted mt-0.5">Since {book.loaned_at.split("T")[0]}</p>
            )}
          </div>
        </div>
      )}

      {/* Genres */}
      {edition.genres && edition.genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {edition.genres.map((genre) => (
            <span key={genre} className="text-xs font-medium px-2.5 py-1 rounded-full bg-pink/15 text-pink-dark">
              {genre}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {(book.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(book.tags || []).map((tag) => (
            <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-light/30 text-slate">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Readers */}
      {readers.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Readers
          </h2>
          <div className="flex flex-wrap gap-2">
            {readers.map((reader, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: reader.color || getAvatarColor(reader.display_name) }}
                >
                  {reader.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-charcoal">{reader.display_name}</span>
                <span className="text-[10px] text-muted">
                  ({reader.read_status === "read" ? "read" : "reading"})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Copy summary */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2 className="text-sm font-semibold text-charcoal mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          My Copy
        </h2>
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
            {status.label}
          </span>
          {edition.format && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-lavender-light/20 text-lavender-dark">
              {edition.format}
            </span>
          )}
          {book.condition && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-mint/15 text-mint-dark">
              {conditionLabels[book.condition] || book.condition}
            </span>
          )}
          {book.location && (
            <span className="text-xs text-muted flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {book.location}
            </span>
          )}
        </div>
        {book.acquired_at && (
          <p className="text-xs text-muted mt-2">Acquired {book.acquired_at}</p>
        )}
      </div>

      {/* Reading summary */}
      {(book.rating || (book.dates_read && book.dates_read.length > 0) || book.notes) && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Reading
          </h2>

          {/* Rating stars */}
          {book.rating && (
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={star <= book.rating! ? "#F5C6AA" : "none"}
                  stroke={star <= book.rating! ? "#F5C6AA" : "#F0EBE6"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
          )}

          {/* Dates read pills */}
          {book.dates_read && book.dates_read.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {book.dates_read.map((d, i) => (
                <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-lavender/10 text-lavender-dark">
                  {d}
                </span>
              ))}
            </div>
          )}

          {book.notes && (
            <p className="text-sm text-muted mt-2 italic leading-relaxed">{book.notes}</p>
          )}
        </div>
      )}

      {/* Description */}
      {edition.description && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-charcoal mb-2" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            About
          </h2>
          <p className="text-sm text-muted leading-relaxed">{edition.description}</p>
        </div>
      )}

      {/* Add to list button */}
      <button
        onClick={openListModal}
        className="w-full py-3 mb-2 text-sm font-medium bg-hover hover:bg-border text-charcoal rounded-2xl transition-all"
      >
        Add to List
      </button>

      {/* Edit button */}
      <Link
        href={`/library/book/${bookId}/edit`}
        className="block w-full py-3 mb-2 text-center text-sm font-medium bg-lavender hover:bg-lavender-hover text-white rounded-2xl transition-all"
      >
        Edit
      </Link>

      {/* Remove button */}
      <button
        onClick={() => setShowRemoveModal(true)}
        className="w-full py-3 text-sm font-medium text-red hover:text-red-dark hover:bg-red/5 rounded-2xl transition-all"
      >
        Remove from Library
      </button>

      {/* Add to list modal */}
      {showListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="list-modal-title">
          <div className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm animate-fade-in" onClick={() => setShowListModal(false)} />
          <div className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-sm relative z-10 animate-scale-in">
            <h3 id="list-modal-title" className="text-lg font-semibold mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Add to List
            </h3>
            {listSuccess ? (
              <div className="text-center py-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <p className="text-sm text-mint-dark">{listSuccess}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {userLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAddToList(list.id)}
                    disabled={addingToList === list.id}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-hover transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-charcoal">{list.name}</span>
                    {addingToList === list.id && (
                      <div className="w-4 h-4 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
                    )}
                  </button>
                ))}
                {userLists.length === 0 && (
                  <p className="text-sm text-muted text-center py-4">No lists yet.</p>
                )}
                <button
                  ref={cancelListRef}
                  onClick={() => setShowListModal(false)}
                  className="w-full mt-2 py-2.5 bg-hover hover:bg-border text-charcoal text-sm font-medium rounded-full transition-all"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove confirmation modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="remove-modal-title">
          <div className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm animate-fade-in" onClick={() => setShowRemoveModal(false)} />
          <div className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-sm relative z-10 animate-scale-in">
            <h3 id="remove-modal-title" className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Remove Book
            </h3>
            <p className="text-sm text-muted mb-4">
              Remove &ldquo;{edition.title}&rdquo; from your library? This won&apos;t delete the book data.
            </p>
            <textarea
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason (optional): sold, donated, lost..."
              rows={2}
              className="w-full px-3 py-2 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                ref={cancelRemoveRef}
                onClick={() => setShowRemoveModal(false)}
                className="flex-1 py-2.5 bg-hover hover:bg-border text-charcoal text-sm font-medium rounded-full transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 py-2.5 bg-red hover:bg-red-dark disabled:opacity-50 text-white text-sm font-medium rounded-full transition-all"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
