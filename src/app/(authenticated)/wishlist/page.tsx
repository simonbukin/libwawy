"use client";

import { useEffect, useState, useCallback } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { WishlistWithEdition } from "@/lib/types/book";

const priorityDots = [
  "bg-[#F0EBE6]",
  "bg-[#A8D5BA]",
  "bg-[#B8A9D4]",
  "bg-[#F5C6AA]",
  "bg-[#E8B4C8]",
];

export default function WishlistPage() {
  const { libraryId, userId, members } = useLibrary();
  const [activeTab, setActiveTab] = useState<"mine" | "partner">("mine");
  const [myWishlist, setMyWishlist] = useState<WishlistWithEdition[]>([]);
  const [partnerWishlist, setPartnerWishlist] = useState<WishlistWithEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const partner = members.find((m) => m.user_id !== userId);
  const partnerName = partner?.display_name || "Partner";

  const fetchWishlists = useCallback(async () => {
    if (!libraryId || !userId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from("wishlists")
      .select("*, book_editions(*)")
      .eq("library_id", libraryId)
      .is("fulfilled_at", null)
      .order("priority", { ascending: false });

    if (data) {
      const items = data as WishlistWithEdition[];
      setMyWishlist(items.filter((w) => w.user_id === userId));
      setPartnerWishlist(items.filter((w) => w.user_id !== userId));
    }
    setLoading(false);
  }, [libraryId, userId]);

  useEffect(() => {
    fetchWishlists();
  }, [fetchWishlists]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from("wishlists").delete().eq("id", id);
    setMyWishlist((prev) => prev.filter((w) => w.id !== id));
    setDeletingId(null);
  };

  const handlePriorityChange = async (id: string, priority: number) => {
    const supabase = createClient();
    await supabase.from("wishlists").update({ priority }).eq("id", id);
    setMyWishlist((prev) =>
      prev.map((w) => (w.id === id ? { ...w, priority } : w))
    );
  };

  const currentList = activeTab === "mine" ? myWishlist : partnerWishlist;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1
          className="text-xl font-bold"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Wishlist
        </h1>
      </div>

      {/* Tab toggle */}
      <div className="flex bg-white border border-[#F0EBE6] rounded-xl p-0.5 mb-4">
        <button
          onClick={() => setActiveTab("mine")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
            activeTab === "mine"
              ? "bg-[#E8B4C8] text-white shadow-sm"
              : "text-[#8A7F85] hover:text-[#3D3539]"
          }`}
        >
          My Wishlist
        </button>
        <button
          onClick={() => setActiveTab("partner")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
            activeTab === "partner"
              ? "bg-[#E8B4C8] text-white shadow-sm"
              : "text-[#8A7F85] hover:text-[#3D3539]"
          }`}
        >
          {partnerName}&apos;s Wishlist
        </button>
      </div>

      {/* Empty state */}
      {currentList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#E8B4C8]/15 flex items-center justify-center mb-4">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E8B4C8"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </div>
          <h2
            className="text-lg font-semibold mb-1"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            {activeTab === "mine"
              ? "Nothing on your wishlist yet!"
              : `${partnerName} hasn't added anything yet`}
          </h2>
          <p className="text-[#8A7F85] text-sm mb-6 max-w-xs">
            {activeTab === "mine"
              ? "Add books you'd love to read or own."
              : "Check back later for gift ideas!"}
          </p>
          {activeTab === "mine" && (
            <Link
              href="/wishlist/add"
              className="bg-[#E8B4C8] hover:bg-[#D9A0B6] text-white font-medium py-2.5 px-6 rounded-full transition-all text-sm"
            >
              Add to Wishlist
            </Link>
          )}
        </div>
      )}

      {/* Wishlist items */}
      {currentList.length > 0 && (
        <div className="space-y-3">
          {currentList.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm p-4 flex gap-3"
            >
              {/* Cover */}
              <div className="w-14 h-20 rounded-lg overflow-hidden bg-[#F8F5F0] flex-shrink-0">
                {item.book_editions.cover_url ? (
                  <img
                    src={item.book_editions.cover_url}
                    alt={item.book_editions.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#E8B4C8]/20">
                    <span
                      className="text-[#E8B4C8] text-lg font-bold"
                      style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                    >
                      {item.book_editions.title.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3
                  className="text-sm font-semibold text-[#3D3539] line-clamp-1"
                  style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                >
                  {item.book_editions.title}
                </h3>
                <p className="text-xs text-[#8A7F85] line-clamp-1">
                  {item.book_editions.authors?.join(", ") || "Unknown author"}
                </p>

                {/* Priority dots */}
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-[#8A7F85] mr-1">Priority:</span>
                  {[1, 2, 3, 4, 5].map((p) =>
                    activeTab === "mine" ? (
                      <button
                        key={p}
                        onClick={() => handlePriorityChange(item.id, p)}
                        className={`w-3 h-3 rounded-full transition-all ${
                          p <= item.priority
                            ? priorityDots[item.priority] || priorityDots[0]
                            : "bg-[#F0EBE6]"
                        }`}
                      />
                    ) : (
                      <div
                        key={p}
                        className={`w-3 h-3 rounded-full ${
                          p <= item.priority
                            ? priorityDots[item.priority] || priorityDots[0]
                            : "bg-[#F0EBE6]"
                        }`}
                      />
                    )
                  )}
                </div>

                {/* Notes */}
                {item.notes && (
                  <p className="text-xs text-[#8A7F85] mt-1 line-clamp-2 italic">
                    {item.notes}
                  </p>
                )}
              </div>

              {/* Delete (only for own wishlist) */}
              {activeTab === "mine" && (
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="self-start p-1.5 text-[#8A7F85] hover:text-[#C97070] transition-colors"
                  aria-label="Remove from wishlist"
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
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FAB for my wishlist */}
      {activeTab === "mine" && (
        <Link
          href="/wishlist/add"
          className="fixed bottom-24 right-5 w-14 h-14 bg-[#E8B4C8] hover:bg-[#D9A0B6] active:bg-[#CC93AA] text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 z-30"
          aria-label="Add to wishlist"
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
