"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { BookWithEdition, List } from "@/lib/types/book";

const conditionLabels: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  read: { bg: "bg-[#B8A9D4]/15", text: "text-[#9B89BF]", label: "Read" },
  reading: { bg: "bg-[#F5C6AA]/20", text: "text-[#D4956F]", label: "Reading" },
  unread: { bg: "bg-[#F0EBE6]", text: "text-[#8A7F85]", label: "Unread" },
  dnf: { bg: "bg-[#C97070]/10", text: "text-[#C97070]", label: "DNF" },
};

const placeholderColors = [
  "bg-[#B8A9D4]",
  "bg-[#A8D5BA]",
  "bg-[#F5C6AA]",
  "bg-[#E8B4C8]",
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
        <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[#8A7F85]">Book not found.</p>
        <Link href="/library" className="text-[#B8A9D4] text-sm mt-2 inline-block">
          Back to library
        </Link>
      </div>
    );
  }

  const edition = book.book_editions;
  const colorIdx = edition.title.charCodeAt(0) % placeholderColors.length;
  const status = statusColors[book.read_status] || statusColors.unread;

  return (
    <div className="px-4 py-4 pb-8">
      {/* Back button */}
      <div className="mb-4">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-[#8A7F85] hover:text-[#3D3539] transition-colors"
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
          <h1 className="text-xl font-bold text-[#3D3539] leading-tight mb-1" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            {edition.title}
          </h1>
          {edition.subtitle && <p className="text-sm text-[#8A7F85] mb-1">{edition.subtitle}</p>}
          <p className="text-sm text-[#8A7F85] mb-2">{edition.authors?.join(", ") || "Unknown author"}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8A7F85]">
            {edition.publisher && <span>{edition.publisher}</span>}
            {edition.published_year && <span>{edition.published_year}</span>}
            {edition.page_count && <span>{edition.page_count} pages</span>}
            {edition.format && <span>{edition.format}</span>}
          </div>
        </div>
      </div>

      {/* Loan banner — prominent */}
      {book.loaned_to && (
        <div className="bg-[#E8B4C8]/20 border-2 border-[#E8B4C8]/40 rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#E8B4C8]/30 flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4819E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              <path d="m9 10 2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-[#3D3539]" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Loaned to {book.loaned_to}
            </p>
            {book.loaned_at && (
              <p className="text-xs text-[#8A7F85] mt-0.5">Since {book.loaned_at.split("T")[0]}</p>
            )}
          </div>
        </div>
      )}

      {/* Genres */}
      {edition.genres && edition.genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {edition.genres.map((genre) => (
            <span key={genre} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#E8B4C8]/15 text-[#C4819E]">
              {genre}
            </span>
          ))}
        </div>
      )}

      {/* Tags */}
      {(book.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(book.tags || []).map((tag) => (
            <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#D4E8F0]/30 text-[#6B9FB8]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Readers */}
      {readers.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            Readers
          </h2>
          <div className="flex flex-wrap gap-2">
            {readers.map((reader, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: reader.color || "#B8A9D4" }}
                >
                  {reader.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-[#3D3539]">{reader.display_name}</span>
                <span className="text-[10px] text-[#8A7F85]">
                  ({reader.read_status === "read" ? "read" : "reading"})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Copy summary */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
          My Copy
        </h2>
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
            {status.label}
          </span>
          {edition.format && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#D4C9E8]/20 text-[#9B89BF]">
              {edition.format}
            </span>
          )}
          {book.condition && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#A8D5BA]/15 text-[#6BAF8D]">
              {conditionLabels[book.condition] || book.condition}
            </span>
          )}
          {book.location && (
            <span className="text-xs text-[#8A7F85] flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {book.location}
            </span>
          )}
        </div>
        {book.acquired_at && (
          <p className="text-xs text-[#8A7F85] mt-2">Acquired {book.acquired_at}</p>
        )}
      </div>

      {/* Reading summary */}
      {(book.rating || (book.dates_read && book.dates_read.length > 0) || book.notes) && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-[#3D3539] mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
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
                <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#B8A9D4]/10 text-[#9B89BF]">
                  {d}
                </span>
              ))}
            </div>
          )}

          {book.notes && (
            <p className="text-sm text-[#8A7F85] mt-2 italic leading-relaxed">{book.notes}</p>
          )}
        </div>
      )}

      {/* Description */}
      {edition.description && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-[#3D3539] mb-2" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
            About
          </h2>
          <p className="text-sm text-[#8A7F85] leading-relaxed">{edition.description}</p>
        </div>
      )}

      {/* Add to list button */}
      <button
        onClick={openListModal}
        className="w-full py-3 mb-2 text-sm font-medium bg-[#F8F5F0] hover:bg-[#F0EBE6] text-[#3D3539] rounded-2xl transition-all"
      >
        Add to List
      </button>

      {/* Edit button */}
      <Link
        href={`/library/book/${bookId}/edit`}
        className="block w-full py-3 mb-2 text-center text-sm font-medium bg-[#B8A9D4] hover:bg-[#A898C7] text-white rounded-2xl transition-all"
      >
        Edit
      </Link>

      {/* Remove button */}
      <button
        onClick={() => setShowRemoveModal(true)}
        className="w-full py-3 text-sm font-medium text-[#C97070] hover:text-[#B85555] hover:bg-[#C97070]/5 rounded-2xl transition-all"
      >
        Remove from Library
      </button>

      {/* Add to list modal */}
      {showListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3D3539]/30 backdrop-blur-sm" onClick={() => setShowListModal(false)} />
          <div className="bg-white rounded-2xl shadow-xl border border-[#F0EBE6] p-6 w-full max-w-sm relative z-10">
            <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Add to List
            </h3>
            {listSuccess ? (
              <div className="text-center py-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <p className="text-sm text-[#6BAF8D]">{listSuccess}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {userLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAddToList(list.id)}
                    disabled={addingToList === list.id}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#F8F5F0] transition-colors flex items-center justify-between"
                  >
                    <span className="text-sm text-[#3D3539]">{list.name}</span>
                    {addingToList === list.id && (
                      <div className="w-4 h-4 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
                    )}
                  </button>
                ))}
                {userLists.length === 0 && (
                  <p className="text-sm text-[#8A7F85] text-center py-4">No lists yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove confirmation modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3D3539]/30 backdrop-blur-sm" onClick={() => setShowRemoveModal(false)} />
          <div className="bg-white rounded-2xl shadow-xl border border-[#F0EBE6] p-6 w-full max-w-sm relative z-10">
            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              Remove Book
            </h3>
            <p className="text-sm text-[#8A7F85] mb-4">
              Remove &ldquo;{edition.title}&rdquo; from your library? This won&apos;t delete the book data.
            </p>
            <textarea
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason (optional): sold, donated, lost..."
              rows={2}
              className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="flex-1 py-2.5 bg-[#F8F5F0] hover:bg-[#F0EBE6] text-[#3D3539] text-sm font-medium rounded-full transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 py-2.5 bg-[#C97070] hover:bg-[#B85555] disabled:opacity-50 text-white text-sm font-medium rounded-full transition-all"
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
