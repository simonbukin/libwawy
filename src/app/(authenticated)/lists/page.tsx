"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { List, ListItemWithEdition } from "@/lib/types/book";

interface ListWithItemsLocal extends List {
  list_items: ListItemWithEdition[];
}

export default function ListsPage() {
  const { libraryId, userId, members } = useLibrary();
  const [activeTab, setActiveTab] = useState<string>("mine");
  const [lists, setLists] = useState<ListWithItemsLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());

  const otherMembers = useMemo(
    () => members.filter((m) => m.user_id !== userId),
    [members, userId]
  );

  const fetchLists = useCallback(async () => {
    if (!libraryId) return;
    const supabase = createClient();

    const { data } = await supabase
      .from("lists")
      .select("*, list_items(*, book_editions(*))")
      .eq("library_id", libraryId)
      .order("created_at", { ascending: true });

    if (data) {
      setLists(data as ListWithItemsLocal[]);
    }
    setLoading(false);
  }, [libraryId]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const toggleCollapse = (listId: string) => {
    setCollapsedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  };

  const isMineTab = activeTab === "mine";
  const currentLists = useMemo(() => {
    if (isMineTab) return lists.filter((l) => l.user_id === userId);
    return lists.filter((l) => l.user_id === activeTab);
  }, [lists, activeTab, userId, isMineTab]);

  const activeDisplayName = useMemo(() => {
    if (isMineTab) return null;
    const member = members.find((m) => m.user_id === activeTab);
    return member?.display_name || "Member";
  }, [activeTab, isMineTab, members]);

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
          Lists
        </h1>
      </div>

      {/* Tab pills */}
      {otherMembers.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveTab("mine")}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
              isMineTab
                ? "bg-[#B8A9D4] text-white"
                : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
            }`}
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            Mine
          </button>
          {otherMembers.map((m) => (
            <button
              key={m.user_id}
              onClick={() => setActiveTab(m.user_id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                activeTab === m.user_id
                  ? "bg-[#B8A9D4] text-white"
                  : "bg-white border border-[#F0EBE6] text-[#8A7F85]"
              }`}
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              {m.display_name || "Member"}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {currentLists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#B8A9D4]/15 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B8A9D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M3 6h.01" />
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
            </svg>
          </div>
          <h2
            className="text-lg font-semibold mb-1"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            {isMineTab ? "No lists yet!" : `${activeDisplayName} has no lists yet`}
          </h2>
          <p className="text-[#8A7F85] text-sm mb-6 max-w-xs">
            {isMineTab ? "Create a list to organize your reading." : "Check back later!"}
          </p>
        </div>
      )}

      {/* Lists */}
      {currentLists.map((list) => {
        const isCollapsed = collapsedLists.has(list.id);
        return (
          <div
            key={list.id}
            className="bg-white rounded-2xl border border-[#F0EBE6] shadow-sm mb-3 overflow-hidden"
          >
            {/* List header */}
            <button
              onClick={() => toggleCollapse(list.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <h3
                  className="text-sm font-semibold text-[#3D3539]"
                  style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                >
                  {list.name}
                </h3>
                <span className="text-xs text-[#8A7F85] bg-[#F8F5F0] px-2 py-0.5 rounded-full">
                  {list.list_items.length}
                </span>
                {list.is_default && (
                  <span className="text-[10px] text-[#8A7F85]">default</span>
                )}
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8A7F85"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${isCollapsed ? "" : "rotate-180"}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Items horizontal scroll */}
            {!isCollapsed && list.list_items.length > 0 && (
              <div className="px-4 pb-3">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {list.list_items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/lists/${list.id}`}
                      className="flex-shrink-0 w-24"
                    >
                      <div className="w-24 h-32 rounded-lg overflow-hidden bg-[#F8F5F0] mb-1.5">
                        {item.book_editions.cover_url ? (
                          <img
                            src={item.book_editions.cover_url}
                            alt={item.book_editions.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#B8A9D4]/20">
                            <span
                              className="text-[#B8A9D4] text-lg font-bold"
                              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                            >
                              {item.book_editions.title.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-[#3D3539] font-medium line-clamp-1">
                        {item.book_editions.title}
                      </p>
                      <p className="text-[10px] text-[#8A7F85] line-clamp-1">
                        {item.book_editions.authors?.join(", ")}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Empty list */}
            {!isCollapsed && list.list_items.length === 0 && (
              <div className="px-4 pb-3">
                <p className="text-xs text-[#8A7F85]">No books in this list yet.</p>
              </div>
            )}

            {/* View all link */}
            {!isCollapsed && list.list_items.length > 0 && (
              <div className="px-4 pb-3">
                <Link
                  href={`/lists/${list.id}`}
                  className="text-xs text-[#B8A9D4] hover:text-[#9B89BF] font-medium"
                >
                  View all →
                </Link>
              </div>
            )}
          </div>
        );
      })}

      {/* FAB for creating list / adding item */}
      {isMineTab && (
        <Link
          href="/lists/add"
          className="fixed bottom-24 right-5 w-14 h-14 bg-[#B8A9D4] hover:bg-[#A898C7] active:bg-[#9B89BF] text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 z-30"
          aria-label="Add to list"
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
