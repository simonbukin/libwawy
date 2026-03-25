"use server";

import { createClient } from "@/lib/supabase/server";
import type { BookWithEdition, LibraryBook } from "@/lib/types/book";

export async function addBookToLibrary(
  libraryId: string,
  editionId: string,
  data?: Partial<LibraryBook>
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: book, error } = await supabase
    .from("library_books")
    .insert({
      library_id: libraryId,
      edition_id: editionId,
      added_by: user.id,
      condition: data?.condition ?? "good",
      location: data?.location ?? null,
      read_status: data?.read_status ?? "unread",
      rating: data?.rating ?? null,
      notes: data?.notes ?? null,
      purchase_price: data?.purchase_price ?? null,
      purchase_date: data?.purchase_date ?? null,
      purchase_notes: data?.purchase_notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: book };
}

export async function updateBook(
  bookId: string,
  data: Partial<LibraryBook>
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  // Strip fields that shouldn't be manually updated
  const { id: _, library_id: __, edition_id: ___, added_by: ____, added_at: _____, ...updateData } = data as LibraryBook;

  const { data: book, error } = await supabase
    .from("library_books")
    .update(updateData)
    .eq("id", bookId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: book };
}

export async function removeBook(bookId: string, reason: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data: book, error } = await supabase
    .from("library_books")
    .update({
      removed_at: new Date().toISOString(),
      removed_reason: reason,
    })
    .eq("id", bookId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: book };
}

export async function searchBooks(
  libraryId: string,
  query: string
): Promise<{ data?: BookWithEdition[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("library_books")
    .select(
      `
      *,
      book_editions!inner (*)
    `
    )
    .eq("library_id", libraryId)
    .is("removed_at", null)
    .textSearch("book_editions.search_vector", query, {
      type: "plain",
      config: "english",
    });

  if (error) {
    return { error: error.message };
  }

  return { data: data as BookWithEdition[] };
}
