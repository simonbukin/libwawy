"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { BookWithEdition } from "@/lib/types/book";

const conditions = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const readStatuses = [
  { value: "unread", label: "Unread" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

const placeholderColors = [
  "bg-[#B8A9D4]",
  "bg-[#A8D5BA]",
  "bg-[#F5C6AA]",
  "bg-[#E8B4C8]",
];

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { members } = useLibrary();
  const bookId = params.id as string;

  const [book, setBook] = useState<BookWithEdition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaves = useRef(0);

  // Clean up status timer on unmount
  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  useEffect(() => {
    async function fetchBook() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("library_books")
        .select("*, book_editions(*)")
        .eq("id", bookId)
        .single();

      if (!error && data) {
        setBook(data as BookWithEdition);
      }
      setLoading(false);
    }
    fetchBook();
  }, [bookId]);

  const updateField = useCallback(
    (field: string, value: string | number | string[] | null) => {
      if (!book) return;

      // Optimistic update
      setBook((prev) => (prev ? { ...prev, [field]: value } : prev));

      // Debounced save
      if (debounceTimers.current[field]) {
        clearTimeout(debounceTimers.current[field]);
      }

      // Clear any pending status reset
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }

      setSaveStatus("saving");
      pendingSaves.current += 1;

      debounceTimers.current[field] = setTimeout(async () => {
        try {
          const supabase = createClient();
          const { error } = await supabase
            .from("library_books")
            .update({ [field]: value })
            .eq("id", bookId);

          pendingSaves.current -= 1;

          if (pendingSaves.current === 0) {
            if (error) {
              setSaveStatus("error");
              statusTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
            } else {
              setSaveStatus("saved");
              statusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
            }
          }
        } catch {
          pendingSaves.current -= 1;
          if (pendingSaves.current === 0) {
            setSaveStatus("error");
            statusTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
          }
        }
      }, 500);
    },
    [book, bookId]
  );

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
  const colorIdx =
    edition.title.charCodeAt(0) % placeholderColors.length;

  return (
    <div className="px-4 py-4 pb-8 relative">
      {/* Save status indicator */}
      {saveStatus !== "idle" && (
        <div className="fixed top-3 right-4 z-40 flex items-center gap-1.5 pointer-events-none">
          {saveStatus === "saving" && (
            <>
              <div className="w-3 h-3 rounded-full border border-[#8A7F85] border-t-transparent animate-spin" />
              <span className="text-xs text-[#8A7F85]">Saving...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6BAF8D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-[#6BAF8D]">Saved</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-[#C97070]" />
              <span className="text-xs text-[#C97070]">Save failed</span>
            </>
          )}
        </div>
      )}

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
            <img
              src={edition.cover_url}
              alt={edition.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${placeholderColors[colorIdx]}`}
            >
              <span className="text-white/90 text-4xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                {edition.title.charAt(0)}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h1
            className="text-xl font-bold text-[#3D3539] leading-tight mb-1"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            {edition.title}
          </h1>
          {edition.subtitle && (
            <p className="text-sm text-[#8A7F85] mb-1">{edition.subtitle}</p>
          )}
          <p className="text-sm text-[#8A7F85] mb-2">
            {edition.authors?.join(", ") || "Unknown author"}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8A7F85]">
            {edition.publisher && <span>{edition.publisher}</span>}
            {edition.published_year && <span>{edition.published_year}</span>}
            {edition.page_count && <span>{edition.page_count} pages</span>}
            {edition.format && <span>{edition.format}</span>}
          </div>
        </div>
      </div>

      {/* My Copy section */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          My Copy
        </h2>

        {/* Condition */}
        <div className="mb-3">
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Condition</label>
          <select
            value={book.condition}
            onChange={(e) => updateField("condition", e.target.value)}
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all appearance-none"
          >
            {conditions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div className="mb-3">
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Location</label>
          <input
            type="text"
            value={book.location || ""}
            onChange={(e) => updateField("location", e.target.value || null)}
            placeholder="e.g., Living room shelf"
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
          />
        </div>

        {/* Read status segmented control */}
        <div>
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Status</label>
          <div className="flex bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl p-0.5">
            {readStatuses.map((s) => (
              <button
                key={s.value}
                onClick={() => updateField("read_status", s.value)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                  book.read_status === s.value
                    ? s.value === "read"
                      ? "bg-[#B8A9D4] text-white shadow-sm"
                      : s.value === "reading"
                        ? "bg-[#F5C6AA] text-white shadow-sm"
                        : "bg-white text-[#3D3539] shadow-sm"
                    : "text-[#8A7F85] hover:text-[#3D3539]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tags section */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Tags
        </h2>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(book.tags || []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-[#D4E8F0]/30 text-[#6B9FB8]"
            >
              {tag}
              <button
                onClick={() =>
                  updateField(
                    "tags",
                    (book.tags || []).filter((t) => t !== tag) as unknown as string
                  )
                }
                className="hover:text-[#3D3539] transition-colors ml-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 6-12 12" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder="Add a tag..."
          className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const input = e.currentTarget;
              const value = input.value.trim().toLowerCase().replace(/,/g, "");
              if (value && !(book.tags || []).includes(value)) {
                updateField(
                  "tags",
                  [...(book.tags || []), value] as unknown as string
                );
              }
              input.value = "";
            }
          }}
        />
      </div>

      {/* Reading section */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Reading
        </h2>

        {/* Read by */}
        <div className="mb-3">
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Read by</label>
          <select
            value={book.read_by || ""}
            onChange={(e) => updateField("read_by", e.target.value || null)}
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all appearance-none"
          >
            <option value="">Not specified</option>
            {members.map((m) => (
              <option key={m.id} value={m.user_id}>
                {m.display_name || "Member"}
              </option>
            ))}
          </select>
        </div>

        {/* Rating */}
        <div className="mb-3">
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() =>
                  updateField("rating", book.rating === star ? null : star)
                }
                className="p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill={
                    book.rating && star <= book.rating ? "#F5C6AA" : "none"
                  }
                  stroke={
                    book.rating && star <= book.rating
                      ? "#F5C6AA"
                      : "#F0EBE6"
                  }
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-[#8A7F85] mb-1.5 block">
              Started
            </label>
            <input
              type="date"
              value={book.started_at?.split("T")[0] || ""}
              onChange={(e) =>
                updateField(
                  "started_at",
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
              className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-[#8A7F85] mb-1.5 block">
              Finished
            </label>
            <input
              type="date"
              value={book.finished_at?.split("T")[0] || ""}
              onChange={(e) =>
                updateField(
                  "finished_at",
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
              className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-[#8A7F85] mb-1.5 block">Notes</label>
          <textarea
            value={book.notes || ""}
            onChange={(e) => updateField("notes", e.target.value || null)}
            placeholder="Your thoughts on this book..."
            rows={3}
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all resize-none"
          />
        </div>
      </div>

      {/* Loan section */}
      <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-[#3D3539] mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Loan
        </h2>

        <div className="mb-3">
          <label className="text-xs text-[#8A7F85] mb-1.5 block">
            Loaned to
          </label>
          <input
            type="text"
            value={book.loaned_to || ""}
            onChange={(e) => updateField("loaned_to", e.target.value || null)}
            placeholder="Person's name"
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
          />
        </div>

        <div>
          <label className="text-xs text-[#8A7F85] mb-1.5 block">
            Loaned on
          </label>
          <input
            type="date"
            value={book.loaned_at?.split("T")[0] || ""}
            onChange={(e) =>
              updateField(
                "loaned_at",
                e.target.value ? new Date(e.target.value).toISOString() : null
              )
            }
            className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
          />
        </div>
      </div>

      {/* Description */}
      {edition.description && (
        <div className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 mb-4">
          <h2
            className="text-sm font-semibold text-[#3D3539] mb-2"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            About
          </h2>
          <p className="text-sm text-[#8A7F85] leading-relaxed">
            {edition.description}
          </p>
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={() => setShowRemoveModal(true)}
        className="w-full py-3 text-sm font-medium text-[#C97070] hover:text-[#B85555] hover:bg-[#C97070]/5 rounded-2xl transition-all"
      >
        Remove from Library
      </button>

      {/* Remove confirmation modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#3D3539]/30 backdrop-blur-sm"
            onClick={() => setShowRemoveModal(false)}
          />
          <div className="bg-white rounded-2xl shadow-xl border border-[#F0EBE6] p-6 w-full max-w-sm relative z-10">
            <h3
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              Remove Book
            </h3>
            <p className="text-sm text-[#8A7F85] mb-4">
              Remove &ldquo;{edition.title}&rdquo; from your library? This
              won&apos;t delete the book data.
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
