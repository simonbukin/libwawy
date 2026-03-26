"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface UserMenuProps {
  displayName: string;
  email: string;
  color: string | null;
}

function getBadgeColor(name: string): string {
  const badgeColors = [
    "#B8A9D4", "#A8D5BA", "#F5C6AA", "#E8B4C8", "#D4C9E8", "#C5E8D2",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return badgeColors[Math.abs(hash) % badgeColors.length];
}

export default function UserMenu({ displayName, email, color }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const avatarColor = color || getBadgeColor(displayName || email);
  const initial = (displayName || email || "?").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
        style={{ backgroundColor: avatarColor }}
        title={email}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-48 bg-white border border-[#F0EBE6] rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0EBE6]">
            <p
              className="text-sm font-semibold text-[#3D3539] truncate"
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              {displayName || "User"}
            </p>
            <p className="text-xs text-[#8A7F85] truncate">{email}</p>
          </div>
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#3D3539] hover:bg-[#F8F5F0] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Settings
            </Link>
            <Link
              href="/lists"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#3D3539] hover:bg-[#F8F5F0] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h13" />
                <path d="M8 12h13" />
                <path d="M8 18h13" />
                <path d="M3 6h.01" />
                <path d="M3 12h.01" />
                <path d="M3 18h.01" />
              </svg>
              Lists
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
