"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useLibrary } from "@/lib/context/library-context";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { BookWithEdition } from "@/lib/types/book";
import { AVATAR_COLORS, getAvatarColor } from "@/lib/utils/avatar";

export default function SettingsPage() {
  const { libraryId, userId, displayName, members, refreshLibrary } = useLibrary();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [libraryName, setLibraryName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [editedName, setEditedName] = useState(displayName || "");
  const [copied, setCopied] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingLibName, setSavingLibName] = useState(false);
  const [memberColor, setMemberColor] = useState<string>("");
  const [savingColor, setSavingColor] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLibrary() {
      if (!libraryId) return;
      const { data } = await supabase
        .from("libraries")
        .select("name, join_code")
        .eq("id", libraryId)
        .single();

      if (data) {
        setLibraryName(data.name || "");
        setJoinCode(data.join_code || "");
      }
    }
    fetchLibrary();
  }, [libraryId, supabase]);

  useEffect(() => {
    setEditedName(displayName || "");
  }, [displayName]);

  useEffect(() => {
    const me = members.find((m) => m.user_id === userId);
    if (me?.color) setMemberColor(me.color);
  }, [members, userId]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveLibraryName = async () => {
    if (!libraryId) return;
    setSavingLibName(true);
    await supabase
      .from("libraries")
      .update({ name: libraryName })
      .eq("id", libraryId);
    setSavingLibName(false);
  };

  const handleSaveDisplayName = async () => {
    if (!libraryId || !userId) return;
    setSavingName(true);
    await supabase
      .from("library_members")
      .update({ display_name: editedName })
      .eq("library_id", libraryId)
      .eq("user_id", userId);
    await refreshLibrary();
    setSavingName(false);
  };

  const handleSaveColor = async (color: string) => {
    if (!libraryId || !userId) return;
    setMemberColor(color);
    setSavingColor(true);
    await supabase
      .from("library_members")
      .update({ color })
      .eq("library_id", libraryId)
      .eq("user_id", userId);
    await refreshLibrary();
    setSavingColor(false);
  };

  const handleExport = async () => {
    if (!libraryId) return;
    setExporting(true);

    const { data } = await supabase
      .from("library_books")
      .select("*, book_editions(*)")
      .eq("library_id", libraryId)
      .is("removed_at", null);

    if (data) {
      const books = data as BookWithEdition[];
      const headers = [
        "Title",
        "Authors",
        "ISBN-13",
        "ISBN-10",
        "Publisher",
        "Year",
        "Pages",
        "Format",
        "Genres",
        "Tags",
        "Condition",
        "Location",
        "Read Status",
        "Rating",
        "Notes",
        "Loaned To",
      ];

      const rows = books.map((b) => [
        b.book_editions.title,
        b.book_editions.authors?.join("; ") || "",
        b.book_editions.isbn_13 || "",
        b.book_editions.isbn_10 || "",
        b.book_editions.publisher || "",
        b.book_editions.published_year?.toString() || "",
        b.book_editions.page_count?.toString() || "",
        b.book_editions.format || "",
        b.book_editions.genres?.join("; ") || "",
        (b.tags || []).join("; "),
        b.condition,
        b.location || "",
        b.read_status,
        b.rating?.toString() || "",
        b.notes || "",
        b.loaned_to || "",
      ]);

      const csvContent = [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `libwawy-export-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }

    setExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !libraryId || !userId) return;
    setImporting(true);
    setImportResult(null);

    try {
      const Papa = (await import("papaparse")).default;
      const text = await file.text();

      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = result.data as Record<string, string>[];

      let added = 0;
      let skipped = 0;

      for (const row of rows) {
        const title = row["Title"] || row["title"];
        const isbn13 = row["ISBN-13"] || row["isbn_13"] || row["ISBN13"];
        const isbn10 = row["ISBN-10"] || row["isbn_10"] || row["ISBN10"];

        if (!title && !isbn13 && !isbn10) {
          skipped++;
          continue;
        }

        // Try to find or create edition
        let editionId: string | null = null;

        if (isbn13 || isbn10) {
          const field = isbn13 ? "isbn_13" : "isbn_10";
          const val = isbn13 || isbn10;
          const { data: existing } = await supabase
            .from("book_editions")
            .select("id")
            .eq(field, val)
            .limit(1)
            .single();

          if (existing) {
            editionId = existing.id;
          }
        }

        if (!editionId && title) {
          // Create a minimal edition
          const { data: newEd } = await supabase
            .from("book_editions")
            .insert({
              isbn_13: isbn13 || null,
              isbn_10: isbn10 || null,
              title,
              authors: row["Authors"]?.split(";").map((a) => a.trim()) || [],
              publisher: row["Publisher"] || null,
              published_year: row["Year"] ? parseInt(row["Year"]) || null : null,
              page_count: row["Pages"] ? parseInt(row["Pages"]) || null : null,
              format: row["Format"] || null,
              language: "en",
            })
            .select("id")
            .single();

          if (newEd) {
            editionId = newEd.id;
          }
        }

        if (!editionId) {
          skipped++;
          continue;
        }

        // Check if already in library
        const { data: existing } = await supabase
          .from("library_books")
          .select("id")
          .eq("library_id", libraryId)
          .eq("edition_id", editionId)
          .is("removed_at", null)
          .limit(1)
          .single();

        if (existing) {
          skipped++;
          continue;
        }

        await supabase.from("library_books").insert({
          library_id: libraryId,
          edition_id: editionId,
          added_by: userId,
          condition: row["Condition"] || "good",
          location: row["Location"] || null,
          read_status: (row["Read Status"] as "unread" | "reading" | "read") || "unread",
          rating: row["Rating"] ? parseInt(row["Rating"]) || null : null,
          notes: row["Notes"] || null,
          loaned_to: row["Loaned To"] || null,
        });

        added++;
      }

      setImportResult(`Imported ${added} book${added !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}.`);
    } catch {
      setImportResult("Import failed. Please check your CSV format.");
    }

    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRefreshMetadata = async () => {
    if (!libraryId) return;
    setRefreshing(true);
    setRefreshResult(null);

    try {
      const { refreshEdition } = await import("@/lib/services/book-lookup");

      // Fetch all book editions that have missing authors or description
      const { data: editions } = await supabase
        .from("book_editions")
        .select("*")
        .or("authors.eq.{},description.is.null");

      if (!editions || editions.length === 0) {
        setRefreshResult("All books already have complete metadata.");
        setRefreshing(false);
        return;
      }

      let updated = 0;
      let failed = 0;

      for (const edition of editions) {
        try {
          const result = await refreshEdition(edition, supabase);
          if (result) updated++;
          else failed++;
        } catch {
          failed++;
        }
      }

      setRefreshResult(
        `Refreshed ${updated} book${updated !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}.`
      );
    } catch {
      setRefreshResult("Refresh failed. Please try again.");
    }

    setRefreshing(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="px-4 py-4">
      <h1
        className="text-xl font-bold mb-6"
        style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
      >
        Settings
      </h1>

      {/* Library name */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-charcoal mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Library Name
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            placeholder="Name your library..."
            className="flex-1 px-3 py-2 bg-cream border border-border rounded-xl text-sm text-charcoal placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all"
          />
          <button
            onClick={handleSaveLibraryName}
            disabled={savingLibName}
            className="bg-lavender hover:bg-lavender-hover disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-xl transition-all"
          >
            {savingLibName ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Join code */}
      {joinCode && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
          <h2
            className="text-sm font-semibold text-charcoal mb-3"
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            Join Code
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 bg-cream border border-border rounded-xl text-sm text-charcoal font-mono tracking-wider">
              {joinCode}
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                copied
                  ? "bg-mint text-white"
                  : "bg-hover hover:bg-border text-charcoal"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted mt-2">
            Share this code with someone to let them join your library.
          </p>
        </div>
      )}

      {/* Members */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-charcoal mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Members
        </h2>
        <div className="space-y-3">
          {members.map((member) => {
            const isMe = member.user_id === userId;
            const avatarColor = isMe
              ? memberColor || getAvatarColor(member.display_name || "?")
              : member.color || getAvatarColor(member.display_name || "?");
            return (
              <div key={member.id} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                  style={{ backgroundColor: avatarColor }}
                >
                  {(member.display_name || "?").charAt(0).toUpperCase()}
                </div>
                {isMe ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Your display name"
                      className="flex-1 px-3 py-1.5 bg-cream border border-border rounded-lg text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-lavender/40 focus:border-lavender transition-all"
                    />
                    <button
                      onClick={handleSaveDisplayName}
                      disabled={savingName}
                      className="text-xs text-lavender hover:text-lavender-dark font-medium transition-colors"
                    >
                      {savingName ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="text-sm text-charcoal">
                      {member.display_name || "Unnamed"}
                    </p>
                    <p className="text-xs text-muted">{member.role}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Color picker for current user */}
          <div className="pt-3 border-t border-border">
            <label className="text-xs text-muted mb-2 block">Your color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleSaveColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    memberColor === c ? "ring-2 ring-offset-2 ring-charcoal" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  disabled={savingColor}
                  aria-label={`Set avatar color to ${c}`}
                />
              ))}
              <label className="relative">
                <input
                  type="color"
                  value={memberColor || "#B8A9D4"}
                  onChange={(e) => handleSaveColor(e.target.value)}
                  className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
                  aria-label="Choose custom color"
                />
                <div
                  className="w-7 h-7 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-lavender transition-colors cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A7F85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-charcoal mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Export Library
        </h2>
        <p className="text-xs text-muted mb-3">
          Download your library as a CSV file.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full bg-hover hover:bg-border disabled:opacity-50 text-charcoal text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {/* Import */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-charcoal mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Import Books
        </h2>
        <p className="text-xs text-muted mb-3">
          Upload a CSV file with columns: Title, Authors, ISBN-13, ISBN-10,
          Publisher, Year, Pages, Format, Condition, Location, Read Status,
          Rating, Notes, Loaned To.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleImport}
          className="hidden"
          id="import-csv"
        />
        <label
          htmlFor="import-csv"
          className={`w-full block text-center cursor-pointer bg-hover hover:bg-border text-charcoal text-sm font-medium py-2.5 rounded-xl transition-all ${
            importing ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {importing ? "Importing..." : "Choose CSV File"}
          </span>
        </label>
        {importResult && (
          <div
            className={`mt-3 px-3 py-2 rounded-xl text-xs ${
              importResult.includes("failed")
                ? "bg-peach/15 text-peach-dark"
                : "bg-mint/15 text-mint-dark"
            }`}
          >
            {importResult}
          </div>
        )}
      </div>

      {/* Refresh metadata */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-4">
        <h2
          className="text-sm font-semibold text-charcoal mb-3"
          style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
        >
          Refresh Metadata
        </h2>
        <p className="text-xs text-muted mb-3">
          Re-fetch metadata for books with missing authors or descriptions using multiple sources.
        </p>
        <button
          onClick={handleRefreshMetadata}
          disabled={refreshing}
          className="w-full bg-hover hover:bg-border disabled:opacity-50 text-charcoal text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {refreshing ? "Refreshing..." : "Refresh Metadata"}
        </button>
        {refreshResult && (
          <div
            className={`mt-3 px-3 py-2 rounded-xl text-xs ${
              refreshResult.includes("failed")
                ? "bg-peach/15 text-peach-dark"
                : "bg-mint/15 text-mint-dark"
            }`}
          >
            {refreshResult}
          </div>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 text-sm font-medium text-red hover:text-red-dark hover:bg-red/5 rounded-2xl transition-all mb-8"
      >
        Sign Out
      </button>
    </div>
  );
}
