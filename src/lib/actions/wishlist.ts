"use server";

import { createClient } from "@/lib/supabase/server";
import type { WishlistWithEdition } from "@/lib/types/book";

export async function addToWishlist(
  libraryId: string,
  editionId: string,
  priority?: number,
  notes?: string
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("wishlists")
    .insert({
      library_id: libraryId,
      user_id: user.id,
      edition_id: editionId,
      priority: priority ?? 3,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}

export async function removeFromWishlist(wishlistId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("wishlists")
    .delete()
    .eq("id", wishlistId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function fulfillWishlist(wishlistId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("wishlists")
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("id", wishlistId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}

export async function checkWishlistMatch(
  libraryId: string,
  editionId: string
): Promise<{ data?: WishlistWithEdition[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("wishlists")
    .select(
      `
      *,
      book_editions (*)
    `
    )
    .eq("library_id", libraryId)
    .eq("edition_id", editionId)
    .is("fulfilled_at", null);

  if (error) {
    return { error: error.message };
  }

  return { data: data as WishlistWithEdition[] };
}
