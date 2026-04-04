"use client";

import { LibraryProvider, useLibrary } from "@/lib/context/library-context";
import Nav from "@/components/nav";
import UserMenu from "@/components/user-menu";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

function AuthenticatedContent({ children }: { children: React.ReactNode }) {
  const { displayName, userId, members, loading } = useLibrary();
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  const currentMember = members.find((m) => m.user_id === userId);
  const memberColor = currentMember?.color || null;

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
        setUserDisplayName(name);
        setUserEmail(user.email || "");
      }
    }
    getUser();
  }, [displayName]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
          <span className="text-muted text-sm">Loading your library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <Link href="/library">
            <h1
              className="text-lg font-bold text-charcoal tracking-tight"
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              libwawy
            </h1>
          </Link>
          <UserMenu
            displayName={userDisplayName}
            email={userEmail}
            color={memberColor}
          />
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
