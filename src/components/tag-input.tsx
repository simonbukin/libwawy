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
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-[#D4E8F0]/30 text-[#6B9FB8]"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-[#3D3539] transition-colors ml-0.5"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
        className="w-full px-3 py-2 bg-[#FFFBF5] border border-[#F0EBE6] rounded-xl text-sm text-[#3D3539] placeholder:text-[#8A7F85]/50 focus:outline-none focus:ring-2 focus:ring-[#B8A9D4]/40 focus:border-[#B8A9D4] transition-all"
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
        <div className="absolute left-0 right-0 mt-1 bg-white border border-[#F0EBE6] rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.tag}
              onClick={() => addTag(s.tag)}
              className="w-full text-left px-3 py-2 text-sm text-[#3D3539] hover:bg-[#F8F5F0] transition-colors flex items-center justify-between"
            >
              <span>{s.tag}</span>
              <span className="text-[10px] text-[#8A7F85]">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
