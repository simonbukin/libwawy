"use client";

import { LibraryProvider, useLibrary } from "@/lib/context/library-context";
import Nav from "@/components/nav";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

function AuthenticatedContent({ children }: { children: React.ReactNode }) {
  const { displayName, loading } = useLibrary();
  const [userInitial, setUserInitial] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    async function getUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const name =
          displayName ||
          user.user_metadata?.full_name ||
          user.email ||
          "?";
        setUserInitial(name.charAt(0).toUpperCase());
        setUserEmail(user.email || "");
      }
    }
    getUser();
  }, [displayName]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
          <span className="text-[#8A7F85] text-sm">Loading your library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#FFFBF5]/80 backdrop-blur-xl border-b border-[#F0EBE6]">
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <h1
            className="text-lg font-bold text-[#3D3539] tracking-tight"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            libwawy
          </h1>
          <div
            className="w-8 h-8 rounded-full bg-[#B8A9D4] flex items-center justify-center text-white text-sm font-semibold"
            title={userEmail}
          >
            {userInitial}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 max-w-4xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom nav */}
      <Nav />
    </div>
  );
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LibraryProvider>
      <AuthenticatedContent>{children}</AuthenticatedContent>
    </LibraryProvider>
  );
}
