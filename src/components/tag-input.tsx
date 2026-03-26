"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  libraryId: string;
}

export default function TagInput({ tags, onChange, libraryId }: TagInputProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<{ tag: string; count: number }[]>([]);
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTags() {
      const supabase = createClient();
      const { data } = await supabase.rpc("library_tags", { lib_id: libraryId });
      if (data) setAllTags(data as { tag: string; count: number }[]);
    }
    fetchTags();
  }, [libraryId]);

  useEffect(() => {
    if (input.trim()) {
      const filtered = allTags
        .filter((t) => t.tag.includes(input.toLowerCase()) && !tags.includes(t.tag))
        .slice(0, 8);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [input, allTags, tags]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addTag = (tag: string) => {
    const cleaned = tag.trim().toLowerCase().replace(/,/g, "");
    if (cleaned && !tags.includes(cleaned)) {
      onChange([...tags, cleaned]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-slate-light/30 text-slate"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-charcoal transition-colors ml-0.5 p-1"
              aria-label={`Remove tag ${tag}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 6-12 12" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add a tag..."
        className="w-full px-3 py-2 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (input.trim()) addTag(input);
          }
        }}
        onFocus={() => {
          if (input.trim() && suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.tag}
              onClick={() => addTag(s.tag)}
              className="w-full text-left px-3 py-2 text-sm text-charcoal hover:bg-hover transition-colors flex items-center justify-between"
            >
              <span>{s.tag}</span>
              <span className="text-[10px] text-muted">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
