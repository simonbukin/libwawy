"use client";

import { useRouter } from "next/navigation";
import type { BookWithEdition } from "@/lib/types/book";
import { getAvatarColor } from "@/lib/utils/avatar";

interface BookCardProps {
  book: BookWithEdition;
  memberColor?: string | null;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  read: { bg: "bg-lavender/15", text: "text-lavender-dark", label: "Read" },
  reading: { bg: "bg-peach/20", text: "text-peach-dark", label: "Reading" },
  unread: { bg: "bg-border", text: "text-muted", label: "Unread" },
  dnf: { bg: "bg-red/10", text: "text-red", label: "DNF" },
};

const conditionColors: Record<string, string> = {
  new: "bg-mint/20 text-mint-dark",
  like_new: "bg-mint/15 text-mint-dark",
  good: "bg-mint/10 text-[#7FB99E]",
  fair: "bg-peach/15 text-[#C49470]",
  poor: "bg-border text-muted",
};

// Pastel palette for placeholder covers
const placeholderColors = [
  "bg-lavender",
  "bg-mint",
  "bg-peach",
  "bg-pink",
  "bg-lavender-light",
  "bg-mint-light",
];

function getPlaceholderColor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placeholderColors[Math.abs(hash) % placeholderColors.length];
}

export default function BookCard({ book, memberColor }: BookCardProps) {
  const router = useRouter();
  const edition = book.book_editions;
  const status = statusColors[book.read_status] || statusColors.unread;
  const conditionClass =
    conditionColors[book.condition] || conditionColors.good;

  return (
    <button
      onClick={() => router.push(`/library/book/${book.id}`)}
      className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] w-full group"
      aria-label={`View ${edition.title} by ${edition.authors?.join(", ") || "unknown author"}`}
    >
      {/* Cover area */}
      <div className="aspect-[2/3] relative overflow-hidden bg-hover">
        {edition.cover_url ? (
          <img
            src={edition.cover_url}
            alt={edition.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${getPlaceholderColor(edition.title)}`}
          >
            <span className="text-white/90 text-4xl font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
              {edition.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Added-by initial badge */}
        {book.added_by_name && (
          <div
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-card shadow-sm"
            style={{ backgroundColor: memberColor || getAvatarColor(book.added_by_name), fontFamily: "var(--font-quicksand), sans-serif" }}
            title={`Added by ${book.added_by_name}`}
          >
            {book.added_by_name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Loaned badge */}
        {book.loaned_to && (
          <div className="absolute top-2 right-2 bg-pink text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Loaned
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-3">
        <h3
          className="text-sm font-semibold text-charcoal line-clamp-2 leading-tight mb-1"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          {edition.title}
        </h3>
        <p className="text-xs text-muted line-clamp-1 mb-2">
          {edition.authors?.join(", ") || "Unknown author"}
        </p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
          {book.condition && book.condition !== "good" && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${conditionClass}`}
            >
              {book.condition.replace("_", " ")}
            </span>
          )}
          {(book.tags || []).slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-light/30 text-slate"
            >
              {tag}
            </span>
          ))}
          {(book.tags || []).length > 2 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-light/20 text-slate/70">
              +{(book.tags || []).length - 2}
            </span>
          )}
          {(book.tags || []).length === 0 && edition.genres?.[0] && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-pink/15 text-pink-dark">
              {edition.genres[0]}
            </span>
          )}
        </div>

        {/* Rating */}
        {book.rating && (
          <div className="flex gap-0.5 mt-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <div
                key={star}
                className={`w-1.5 h-1.5 rounded-full ${
                  star <= book.rating!
                    ? "bg-peach"
                    : "bg-border"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
