"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { LibraryMember } from "@/lib/types/book";

interface LibraryContextValue {
  libraryId: string | null;
  userId: string | null;
  displayName: string | null;
  members: LibraryMember[];
  loading: boolean;
  refreshLibrary: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue>({
  libraryId: null,
  userId: null,
  displayName: null,
  members: [],
  loading: true,
  refreshLibrary: async () => {},
});

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [members, setMembers] = useState<LibraryMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLibraryData = useCallback(async () => {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    // Get the user's library membership
    const { data: membership } = await supabase
      .from("library_members")
      .select("library_id, display_name")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      setLoading(false);
      return;
    }

    setLibraryId(membership.library_id);
    setDisplayName(membership.display_name);

    // Get all members of this library
    const { data: allMembers } = await supabase
      .from("library_members")
      .select("*")
      .eq("library_id", membership.library_id);

    if (allMembers) {
      setMembers(allMembers as LibraryMember[]);
    }

    setLoading(false);
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLoading(true);
    await fetchLibraryData();
  }, [fetchLibraryData]);

  useEffect(() => {
    fetchLibraryData();
  }, [fetchLibraryData]);

  return (
    <LibraryContext.Provider
      value={{ libraryId, userId, displayName, members, loading, refreshLibrary }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  return useContext(LibraryContext);
}
