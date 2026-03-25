"use client";

import { useRouter } from "next/navigation";
import type { BookWithEdition } from "@/lib/types/book";

interface BookCardProps {
  book: BookWithEdition;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  read: { bg: "bg-[#B8A9D4]/15", text: "text-[#9B89BF]", label: "Read" },
  reading: { bg: "bg-[#F5C6AA]/20", text: "text-[#D4956F]", label: "Reading" },
  unread: { bg: "bg-[#F0EBE6]", text: "text-[#8A7F85]", label: "Unread" },
};

const conditionColors: Record<string, string> = {
  new: "bg-[#A8D5BA]/20 text-[#6BAF8D]",
  like_new: "bg-[#A8D5BA]/15 text-[#6BAF8D]",
  good: "bg-[#A8D5BA]/10 text-[#7FB99E]",
  fair: "bg-[#F5C6AA]/15 text-[#C49470]",
  poor: "bg-[#F0EBE6] text-[#8A7F85]",
};

// Badge colors for "added by" initials
const badgeColors = [
  "#B8A9D4", // lavender
  "#A8D5BA", // mint
  "#F5C6AA", // peach
  "#E8B4C8", // pink
  "#D4C9E8", // light lavender
  "#C5E8D2", // light mint
];

function getBadgeColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return badgeColors[Math.abs(hash) % badgeColors.length];
}

// Pastel palette for placeholder covers
const placeholderColors = [
  "bg-[#B8A9D4]",
  "bg-[#A8D5BA]",
  "bg-[#F5C6AA]",
  "bg-[#E8B4C8]",
  "bg-[#D4C9E8]",
  "bg-[#C5E8D2]",
];

function getPlaceholderColor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placeholderColors[Math.abs(hash) % placeholderColors.length];
}

export default function BookCard({ book }: BookCardProps) {
  const router = useRouter();
  const edition = book.book_editions;
  const status = statusColors[book.read_status] || statusColors.unread;
  const conditionClass =
    conditionColors[book.condition] || conditionColors.good;

  return (
    <button
      onClick={() => router.push(`/library/book/${book.id}`)}
      className="bg-white rounded-2xl shadow-sm border border-[#F0EBE6] overflow-hidden text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] w-full group"
    >
      {/* Cover area */}
      <div className="aspect-[2/3] relative overflow-hidden bg-[#F8F5F0]">
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
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white shadow-sm"
            style={{ backgroundColor: getBadgeColor(book.added_by_name), fontFamily: "var(--font-quicksand), sans-serif" }}
            title={`Added by ${book.added_by_name}`}
          >
            {book.added_by_name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Loaned badge */}
        {book.loaned_to && (
          <div className="absolute top-2 right-2 bg-[#E8B4C8] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Loaned
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-3">
        <h3
          className="text-sm font-semibold text-[#3D3539] line-clamp-2 leading-tight mb-1"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          {edition.title}
        </h3>
        <p className="text-xs text-[#8A7F85] line-clamp-1 mb-2">
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
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#D4E8F0]/30 text-[#6B9FB8]"
            >
              {tag}
            </span>
          ))}
          {(book.tags || []).length > 2 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#D4E8F0]/20 text-[#6B9FB8]/70">
              +{(book.tags || []).length - 2}
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
                    ? "bg-[#F5C6AA]"
                    : "bg-[#F0EBE6]"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
