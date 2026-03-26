"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { List, ListItemWithEdition } from "@/lib/types/book";

export default function ListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userId } = useLibrary();
  const listId = params.id as string;

  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItemWithEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  const isOwner = list?.user_id === userId;

  const fetchList = useCallback(async () => {
    const supabase = createClient();

    const { data: listData } = await supabase
      .from("lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (listData) {
      setList(listData as List);
      setNewName(listData.name);
    }

    const { data: itemsData } = await supabase
      .from("list_items")
      .select("*, book_editions(*)")
      .eq("list_id", listId)
      .order("position", { ascending: true });

    if (itemsData) {
      setItems(itemsData as ListItemWithEdition[]);
    }
    setLoading(false);
  }, [listId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
      }
    };
    if (showDeleteModal) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [showDeleteModal]);

  useEffect(() => {
    if (showDeleteModal) cancelDeleteRef.current?.focus();
  }, [showDeleteModal]);

  const handleRemoveItem = async (itemId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("list_items").delete().eq("id", itemId);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    }
  };

  const handleRename = async () => {
    if (!list || !newName.trim()) return;
    const supabase = createClient();
    await supabase.from("lists").update({ name: newName.trim() }).eq("id", list.id);
    setList({ ...list, name: newName.trim() });
    setEditingName(false);
  };

  const handleDelete = async () => {
    if (!list) return;
    setDeleting(true);
    const supabase = createClient();
    // Try deleting list first — if FK cascade is set, items delete automatically
    const { error } = await supabase.from("lists").delete().eq("id", list.id);
    if (error) {
      // FK constraint likely prevents deletion — delete items first, then list
      await supabase.from("list_items").delete().eq("list_id", list.id);
      await supabase.from("lists").delete().eq("id", list.id);
    }
    router.push("/lists");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-muted">List not found.</p>
        <Link href="/lists" className="text-lavender text-sm mt-2 inline-block">
          Back to lists
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/lists"
          className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-hover transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D3539" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        {editingName ? (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-cream border border-border rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-lavender/40"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
            <button onClick={handleRename} className="text-xs text-lavender font-medium">Save</button>
            <button onClick={() => setEditingName(false)} className="text-xs text-muted">Cancel</button>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <h1
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              {list.name}
            </h1>
            {isOwner && !list.is_default && (
              <button onClick={() => setEditingName(true)} className="p-1 text-muted hover:text-charcoal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted text-sm mb-4">No books in this list yet.</p>
          {isOwner && (
            <Link
              href={`/lists/add?listId=${list.id}`}
              className="bg-lavender hover:bg-lavender-hover text-white font-medium py-2.5 px-6 rounded-full transition-all text-sm"
            >
              Add Books
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-card rounded-2xl border border-border shadow-sm p-4 flex gap-3"
            >
              <div className="w-14 h-20 rounded-lg overflow-hidden bg-hover flex-shrink-0">
                {item.book_editions.cover_url ? (
                  <img
                    src={item.book_editions.cover_url}
                    alt={item.book_editions.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-lavender/20">
                    <span className="text-lavender text-lg font-bold" style={{ fontFamily: "var(--font-quicksand), sans-serif" }}>
                      {item.book_editions.title.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className="text-sm font-semibold text-charcoal line-clamp-1"
                  style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                >
                  {item.book_editions.title}
                </h3>
                <p className="text-xs text-muted line-clamp-1">
                  {item.book_editions.authors?.join(", ") || "Unknown author"}
                </p>
                {item.notes && (
                  <p className="text-xs text-muted mt-1 line-clamp-2 italic">{item.notes}</p>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="self-start p-1.5 text-muted hover:text-red transition-colors"
                  aria-label="Remove from list"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m18 6-12 12" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {isOwner && (
        <div className="mt-6 space-y-3">
          <Link
            href={`/lists/add?listId=${list.id}`}
            className="block w-full py-3 text-center text-sm font-medium bg-hover hover:bg-border text-charcoal rounded-2xl transition-all"
          >
            Add Books to List
          </Link>
          {!list.is_default && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full py-3 text-sm font-medium text-red hover:text-red-dark hover:bg-red/5 rounded-2xl transition-all"
            >
              Delete List
            </button>
          )}
        </div>
      )}

      {/* FAB */}
      {isOwner && (
        <Link
          href={`/lists/add?listId=${list.id}`}
          className="fixed bottom-24 right-5 w-14 h-14 bg-lavender hover:bg-lavender-hover active:bg-lavender-dark text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 z-30"
          aria-label="Add to list"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </Link>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div
            className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-sm relative z-10 animate-scale-in">
            <h3
              id="delete-modal-title"
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              Delete List
            </h3>
            <p className="text-sm text-muted mb-4">
              Delete &ldquo;{list.name}&rdquo; and all its items? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelDeleteRef}
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-hover hover:bg-border text-charcoal text-sm font-medium rounded-full transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red hover:bg-red-dark disabled:opacity-50 text-white text-sm font-medium rounded-full transition-all"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
