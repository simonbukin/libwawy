"use server";

import { createClient } from "@/lib/supabase/server";

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // removed ambiguous: I,O,0,1
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function createLibrary(name: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  const joinCode = generateJoinCode();
  const libraryId = crypto.randomUUID();

  const { error: libraryError } = await supabase
    .from("libraries")
    .insert({ id: libraryId, name, join_code: joinCode });

  if (libraryError) {
    return { error: libraryError.message };
  }

  const { error: memberError } = await supabase
    .from("library_members")
    .insert({
      library_id: libraryId,
      user_id: user.id,
      role: "owner",
      display_name: displayName,
    });

  if (memberError) {
    return { error: memberError.message };
  }

  // Create default lists
  await supabase.from("lists").insert([
    { library_id: libraryId, user_id: user.id, name: "TBR", slug: "tbr", is_default: true },
    { library_id: libraryId, user_id: user.id, name: "Wishlist", slug: "wishlist", is_default: true },
  ]);

  return { data: { id: libraryId, name, join_code: joinCode } };
}

export async function joinLibrary(joinCode: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  // Reuse existing display name from any library membership, else pull from Google profile
  const { data: existingMembership } = await supabase
    .from("library_members")
    .select("display_name")
    .eq("user_id", user.id)
    .not("display_name", "is", null)
    .limit(1)
    .single();

  const displayName =
    existingMembership?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";

  const { data: library, error: findError } = await supabase
    .from("libraries")
    .select("id")
    .eq("join_code", joinCode)
    .single();

  if (findError || !library) {
    return { error: "Library not found. Check your join code." };
  }

  // Check if user is already a member
  const { data: existing } = await supabase
    .from("library_members")
    .select("id")
    .eq("library_id", library.id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return { error: "You are already a member of this library." };
  }

  const { error: memberError } = await supabase
    .from("library_members")
    .insert({
      library_id: library.id,
      user_id: user.id,
      role: "member",
      display_name: displayName,
    });

  if (memberError) {
    return { error: memberError.message };
  }

  // Create default lists
  await supabase.from("lists").insert([
    { library_id: library.id, user_id: user.id, name: "TBR", slug: "tbr", is_default: true },
    { library_id: library.id, user_id: user.id, name: "Wishlist", slug: "wishlist", is_default: true },
  ]);

  return { data: library };
}
