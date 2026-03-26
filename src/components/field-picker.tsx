"use client";

import { useState, useRef, useEffect } from "react";
import type { FieldOption } from "@/lib/services/providers/types";

const PROVIDER_COLORS: Record<string, string> = {
  openlibrary: "bg-mint/20 text-mint-dark",
  google: "bg-slate/20 text-slate",
  hardcover: "bg-lavender/20 text-lavender-dark",
  openbd: "bg-peach/20 text-peach-dark",
};

function formatValue(value: unknown, field: string): string {
  if (value === null || value === undefined) return "—";
  if (field === "authors" && Array.isArray(value)) {
    return value.join(", ");
  }
  if (field === "genres" && Array.isArray(value)) {
    return value.join(", ");
  }
  if (field === "description" && typeof value === "string") {
    return value.length > 100 ? value.slice(0, 100) + "…" : value;
  }
  return String(value);
}

export default function FieldPicker({
  label,
  field,
  currentValue,
  options,
  onPick,
}: {
  label: string;
  field: string;
  currentValue: unknown;
  options: FieldOption[];
  onPick: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hasAlternatives = options.length > 1 || (options.length === 1 && formatValue(options[0].value, field) !== formatValue(currentValue, field));

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-muted mb-0.5 block">{label}</label>
          {field === "cover_url" && currentValue ? (
            <div className="w-12 h-16 rounded-lg overflow-hidden bg-hover">
              <img
                src={String(currentValue)}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <p className="text-sm text-charcoal break-words">
              {formatValue(currentValue, field) || <span className="text-muted italic">Not set</span>}
            </p>
          )}
        </div>
        {hasAlternatives && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-4 flex-shrink-0 w-6 h-6 rounded-full bg-lavender/10 hover:bg-lavender/20 flex items-center justify-center transition-colors"
            title="Pick from providers"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9B8BB4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-card rounded-xl border border-border shadow-lg overflow-hidden animate-fade-in">
          <div className="p-2 text-[10px] text-muted font-medium uppercase tracking-wide border-b border-border">
            Pick {label.toLowerCase()}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.map((opt, i) => (
              <button
                key={`${opt.provider}-${i}`}
                onClick={() => {
                  onPick(opt.value);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-hover transition-colors border-b border-border/50 last:border-0"
              >
                {field === "cover_url" && opt.value ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-hover flex-shrink-0">
                      <img
                        src={String(opt.value)}
                        alt="Cover option"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PROVIDER_COLORS[opt.provider] || "bg-hover text-muted"}`}
                    >
                      {opt.providerName}
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-charcoal mb-1">
                      {formatValue(opt.value, field)}
                    </p>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PROVIDER_COLORS[opt.provider] || "bg-hover text-muted"}`}
                    >
                      {opt.providerName}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
