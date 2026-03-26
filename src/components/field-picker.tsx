"use client";

import { useState, useRef, useEffect } from "react";
import type { FieldOption } from "@/lib/services/providers/types";

const PROVIDER_COLORS: Record<string, string> = {
  openlibrary: "bg-mint/20 text-mint-dark",
  google: "bg-slate/20 text-slate",
  hardcover: "bg-lavender/20 text-lavender-dark",
  openbd: "bg-peach/20 text-peach-dark",
  goodreads: "bg-pink/20 text-pink-dark",
  amazon: "bg-peach/20 text-peach-dark",
};

function formatValue(value: unknown, field: string): string {
  if (value === null || value === undefined) return "";
  if (field === "authors" && Array.isArray(value)) {
    return value.join(", ");
  }
  if (field === "genres" && Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function formatPreview(value: unknown, field: string): string {
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

/** Parse a comma-separated string back to an array */
function parseArray(str: string): string[] {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a numeric string, returning null for empty/invalid */
function parseNumber(str: string): number | null {
  if (!str.trim()) return null;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
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

  const isArrayField = field === "authors" || field === "genres";
  const isNumberField = field === "published_year" || field === "page_count";
  const isTextArea = field === "description";
  const isCover = field === "cover_url";

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

  const hasAlternatives =
    options.length > 1 ||
    (options.length === 1 &&
      formatPreview(options[0].value, field) !==
        formatPreview(currentValue, field));

  const handleTextChange = (raw: string) => {
    if (isArrayField) {
      onPick(parseArray(raw));
    } else if (isNumberField) {
      onPick(parseNumber(raw));
    } else {
      onPick(raw || null);
    }
  };

  const inputClasses =
    "w-full px-3 py-2 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all";

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-muted mb-1 block">{label}</label>

          {isCover ? (
            /* Cover: thumbnail + text input for URL */
            <div className="flex items-start gap-3">
              {typeof currentValue === "string" && currentValue && (
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-hover flex-shrink-0">
                  <img
                    src={String(currentValue)}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <input
                type="text"
                value={String(currentValue ?? "")}
                onChange={(e) => onPick(e.target.value || null)}
                placeholder="Cover image URL"
                className={`${inputClasses} flex-1`}
              />
            </div>
          ) : isTextArea ? (
            <textarea
              value={formatValue(currentValue, field)}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}...`}
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          ) : (
            <input
              type={isNumberField ? "number" : "text"}
              value={formatValue(currentValue, field)}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={
                isArrayField
                  ? `Comma-separated ${label.toLowerCase()}`
                  : `Enter ${label.toLowerCase()}...`
              }
              className={inputClasses}
            />
          )}
        </div>

        {/* Provider picker button */}
        {hasAlternatives && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-6 flex-shrink-0 w-6 h-6 rounded-full bg-lavender/10 hover:bg-lavender/20 flex items-center justify-center transition-colors"
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

      {/* Provider options dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-card rounded-xl border border-border shadow-lg overflow-hidden animate-fade-in">
          <div className="p-2 text-[10px] text-muted font-medium uppercase tracking-wide border-b border-border">
            Pick {label.toLowerCase()} from provider
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
                {isCover && opt.value ? (
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
                      {formatPreview(opt.value, field)}
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
