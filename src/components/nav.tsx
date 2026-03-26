"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  {
    label: "Library",
    href: "/library",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        {!active && <path d="M8 7h6" />}
        {!active && <path d="M8 11h4" />}
      </svg>
    ),
  },
  {
    label: "Scan",
    href: "/library/scan",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        {active ? (
          <>
            <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" opacity="0.2" />
            <line x1="7" y1="12" x2="17" y2="12" />
          </>
        ) : (
          <line x1="7" y1="12" x2="17" y2="12" />
        )}
      </svg>
    ),
  },
  {
    label: "Lists",
    href: "/lists",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
        <path d="M15 3v4a2 2 0 0 0 2 2h4" />
        {!active && <path d="M9 13h6" />}
        {!active && <path d="M9 17h3" />}
      </svg>
    ),
  },
];

export default function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/library") {
      return pathname === "/library" || pathname === "/library/add";
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-white/80 backdrop-blur-xl border-t border-[#F0EBE6]">
        <div className="flex items-center justify-around max-w-lg mx-auto px-2">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 py-2 px-4 min-w-[64px] transition-colors duration-200 ${
                  active ? "text-[#B8A9D4]" : "text-[#8A7F85]"
                }`}
              >
                {tab.icon(active)}
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-[#B8A9D4]" : "text-[#8A7F85]"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area spacer for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </nav>
  );
}
