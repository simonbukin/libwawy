# Bookshelf App — Schema & Architecture Blueprint

## Overview

A shared household book library for two users, with per-person wishlists, 
edition-level tracking, barcode scan → ISBN lookup, and CSV import/export.
Hosted free on Vercel (frontend) + Supabase (backend + auth).

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) | Free on Vercel, SSR for fast search, great mobile |
| Backend/DB | Supabase (Postgres) | Free tier, auth built in, realtime, RLS policies |
| Auth | Supabase Auth + Google OAuth | One-click login, no password management |
| Book data | Open Library API + Google Books API | Free, ISBN → edition data + cover images |
| Barcode scan | `html5-qrcode` or `zxing-js` | Camera-based ISBN scan in browser, no native app needed |
| Search | Postgres full-text search (tsvector) + Supabase client | Sub-100ms on a few thousand books, no Algolia needed |
| CSV | `papaparse` | Parse + generate CSV on the client |

---

## External API Strategy

### Primary: Open Library (openlibrary.org)
- `GET /isbn/{isbn}.json` → edition metadata
- `GET /works/{work_id}.json` → canonical work (author, description)
- Cover: `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg`
- **Free, no key required**

### Fallback: Google Books API
- `GET /volumes?q=isbn:{isbn}` → metadata + thumbnail
- Free up to 1,000 requests/day (more than enough)
- Use when Open Library returns incomplete data

### Strategy
1. Scan/enter ISBN
2. Hit Open Library first
3. If title/author/cover missing → fall back to Google Books
4. Store fetched data locally in `book_editions` table (cache it — never re-fetch the same ISBN)

---

## Database Schema

### `libraries`
One row per household. Just the two of you for now.

```sql
create table libraries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,               -- "The Hendersons' Library"
  join_code    text unique,                  -- reserved for future invite use
  created_at   timestamptz default now()
);
```

---

### `library_members`
Links users to a library. Role = 'owner' | 'member'.

```sql
create table library_members (
  id           uuid primary key default gen_random_uuid(),
  library_id   uuid references libraries(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  role         text not null default 'member', -- 'owner' | 'member'
  display_name text,                           -- "Matt" / "Sarah"
  joined_at    timestamptz default now(),
  unique(library_id, user_id)
);
```

---

### `book_editions`
**The canonical book data cache.** One row per unique ISBN.
Populated from Open Library / Google Books on first scan/lookup.
Never deleted — this is your local book database.

```sql
create table book_editions (
  id              uuid primary key default gen_random_uuid(),
  isbn_13         text unique,             -- preferred
  isbn_10         text unique,
  title           text not null,
  subtitle        text,
  authors         text[] not null,         -- ["Cormac McCarthy"]
  publisher       text,
  published_year  int,
  language        text default 'en',
  format          text,                    -- 'hardcover' | 'paperback' | 'mass_market' | 'other'
  page_count      int,
  cover_url       text,                    -- cached URL from Open Library or Google Books
  open_library_id text,                    -- /books/OL... for linking back
  google_books_id text,
  description     text,
  genres          text[],                  -- ["Fiction", "Literary Fiction"]
  search_vector   tsvector,               -- for full-text search
  fetched_at      timestamptz default now()
);

-- Full-text search index (title + authors + publisher)
create index book_editions_search_idx on book_editions using gin(search_vector);

-- Trigger to keep search_vector updated automatically
create or replace function update_book_search_vector()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.authors, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.publisher, '')), 'C');
  return new;
end;
$$ language plpgsql;

create trigger book_search_vector_trigger
before insert or update on book_editions
for each row execute function update_book_search_vector();
```

**Key design decisions:**
- `authors` is an array → handles co-authors cleanly, no join table needed at this scale
- `genres` is an array → same reasoning
- `search_vector` is computed and indexed → instant full-text search, no Algolia
- This table is **library-agnostic** — it's a shared cache across all libraries

---

### `library_books`
**A copy of a book that exists in the library.**
One row per physical copy. Two copies of the same edition = two rows.

```sql
create table library_books (
  id              uuid primary key default gen_random_uuid(),
  library_id      uuid references libraries(id) on delete cascade,
  edition_id      uuid references book_editions(id) on delete restrict,
  added_by        uuid references auth.users(id),
  added_at        timestamptz default now(),

  -- Physical copy details
  condition       text default 'good',     -- 'new' | 'good' | 'fair' | 'poor'
  location        text,                    -- "Living room shelf B", "Office", "Bedroom"
  loaned_to       text,                    -- freetext: "Sarah from work"
  loaned_at       timestamptz,             -- when it was loaned out
  purchase_price  numeric(8,2),
  purchase_date   date,
  purchase_notes  text,                    -- "Powell's Books, Portland"

  -- Reading state (per-copy, not per-edition — you might re-read it)
  read_status     text default 'unread',   -- 'unread' | 'reading' | 'read'
  read_by         uuid references auth.users(id),  -- who read/is reading this copy
  started_at      date,
  finished_at     date,
  rating          int check (rating between 1 and 5),
  notes           text,                    -- personal notes / review

  -- Soft delete (don't lose history)
  removed_at      timestamptz,             -- null = still in library
  removed_reason  text                     -- 'donated' | 'sold' | 'lost' | 'other'
);

-- Fast lookup: "do we own this edition?"
create index library_books_edition_idx on library_books(library_id, edition_id)
  where removed_at is null;
```

**Key design decisions:**
- Each physical copy is its own row → supports "we own 2 copies of this, one is good, one is fair"
- `removed_at` soft delete → you keep history, CSV export can include removed books if needed
- `read_by` + `read_status` are on the copy → one of you might have read it, the other hasn't
- `loaned_to` is freetext as requested — simple and flexible

---

### `wishlists`
Per-person. Visible to all library members, but "owned" by the user who added it.

```sql
create table wishlists (
  id              uuid primary key default gen_random_uuid(),
  library_id      uuid references libraries(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  edition_id      uuid references book_editions(id) on delete restrict,
  added_at        timestamptz default now(),
  priority        int default 3 check (priority between 1 and 5),  -- 1=high, 5=low
  notes           text,               -- "Want the hardcover edition specifically"
  fulfilled_at    timestamptz,        -- set when the book is added to the library
  unique(user_id, edition_id)         -- one wishlist entry per person per edition
);
```

**Key design decisions:**
- `fulfilled_at` → when you scan a book that's on someone's wishlist, mark it fulfilled automatically
- `unique(user_id, edition_id)` → can't wishlist the same edition twice
- Visible to library members via RLS policy

---

## Row Level Security (RLS) Policies

All tables are protected. Users can only see/modify data for libraries they belong to.

```sql
-- Enable RLS on all tables
alter table libraries enable row level security;
alter table library_members enable row level security;
alter table book_editions enable row level security;
alter table library_books enable row level security;
alter table wishlists enable row level security;

-- Helper function: get library IDs for current user
create or replace function my_library_ids()
returns setof uuid as $$
  select library_id from library_members where user_id = auth.uid()
$$ language sql security definer stable;

-- library_books: members can read/write for their libraries
create policy "members can view library books"
  on library_books for select
  using (library_id in (select my_library_ids()));

create policy "members can insert library books"
  on library_books for insert
  with check (library_id in (select my_library_ids()));

create policy "members can update library books"
  on library_books for update
  using (library_id in (select my_library_ids()));

-- wishlists: members of the same library can see all wishlists
create policy "members can view all wishlists in library"
  on wishlists for select
  using (library_id in (select my_library_ids()));

-- wishlists: users can only insert/update/delete their own
create policy "users manage own wishlist"
  on wishlists for insert
  with check (user_id = auth.uid() and library_id in (select my_library_ids()));

create policy "users manage own wishlist update"
  on wishlists for update
  using (user_id = auth.uid());

-- book_editions: readable by anyone authenticated (it's a shared cache)
create policy "authenticated users can read editions"
  on book_editions for select
  using (auth.uid() is not null);

create policy "authenticated users can insert editions"
  on book_editions for insert
  with check (auth.uid() is not null);
```

---

## Search Architecture

### In-library search (finding a book you own)
Use Postgres full-text search on `book_editions.search_vector`, joined to `library_books`:

```sql
select
  be.*,
  lb.condition, lb.location, lb.read_status, lb.rating, lb.loaned_to,
  lm.display_name as added_by_name
from book_editions be
join library_books lb on lb.edition_id = be.id
join library_members lm on lm.user_id = lb.added_by
where lb.library_id = $1
  and lb.removed_at is null
  and be.search_vector @@ plainto_tsquery('english', $2)
order by ts_rank(be.search_vector, plainto_tsquery('english', $2)) desc;
```

### "Do we own this?" check (at bookstore)
Single fast lookup by ISBN when you scan a barcode:

```sql
select lb.id, be.title, be.authors, lb.condition, lb.location
from library_books lb
join book_editions be on be.id = lb.edition_id
where lb.library_id = $1
  and lb.removed_at is null
  and (be.isbn_13 = $2 or be.isbn_10 = $2);
```

This hits the index on `(library_id, edition_id)` + ISBN lookup — effectively instant.

### Wishlist duplicate check
When adding a book to wishlist, check if anyone in the library already owns it:

```sql
select count(*) > 0 as already_owned
from library_books lb
join book_editions be on be.id = lb.edition_id
where lb.library_id = $1
  and lb.removed_at is null
  and (be.isbn_13 = $2 or be.isbn_10 = $2);
```

---

## CSV Format

A single flat format that covers both export and import (and Goodreads/LibraryThing compatibility).

```
isbn_13, isbn_10, title, subtitle, authors, publisher, published_year,
format, condition, location, read_status, rating, notes,
purchase_price, purchase_date, purchase_notes, loaned_to,
added_by, added_at, wishlist_owner, wishlist_priority, wishlist_notes,
status (owned | wishlisted | removed)
```

**Import rules:**
- Match existing editions by `isbn_13` first, then `isbn_10`, then `title + authors`
- If ISBN found in `book_editions` cache → skip API fetch, use cached data
- If status = `owned` → insert into `library_books`
- If status = `wishlisted` → insert into `wishlists` for the importing user
- Duplicate detection: if `(library_id, edition_id)` already exists with `removed_at IS NULL` → skip or prompt
- Missing fields → use defaults

**Goodreads import compatibility:**
Goodreads CSV has `ISBN13`, `Title`, `Author`, `My Rating`, `Exclusive Shelf` (read/to-read/currently-reading).
Map these to our schema on import automatically.

---

## Application Routes

```
/                    → redirect to /library or /login
/login               → Google OAuth
/library             → main view: all books in shared library
/library/scan        → barcode scan → instant lookup → add flow
/library/add         → manual add by ISBN or title search
/library/book/[id]   → book detail (copy-level: condition, notes, loan status)
/wishlist            → your wishlist + partner's wishlist (read-only theirs)
/wishlist/add        → add to your wishlist
/settings            → library name, CSV export, CSV import, user display names
```

---

## Key Frontend Behaviors

1. **Scan flow**: Camera → decode ISBN → check "already owned?" instantly →
   - If owned: show which copy, condition, location. Done.
   - If on wishlist: show whose wishlist. Offer to add to library + mark fulfilled.
   - If neither: fetch metadata → show preview → confirm → add to library.

2. **Search**: Debounced input → Supabase RPC call with plainto_tsquery →
   results in <100ms. No loading spinners needed at this scale.

3. **Offline hint**: Store last-known library as JSON in localStorage so
   the "do we own this?" check works even with spotty bookstore wifi
   (stale-while-revalidate pattern).

4. **Wishlist fulfillment**: When a book is scanned/added and it matches
   an active wishlist entry for any library member → auto-prompt
   "This is on [Name]'s wishlist — mark as fulfilled?"

---

## Free Hosting Plan

| Service | Free Tier Limits | Our Usage |
|---|---|---|
| Supabase | 500MB DB, 2GB bandwidth, 50MB file storage | ~50MB for 5,000 books + covers |
| Vercel | 100GB bandwidth, unlimited deploys | Easily within limits |
| Open Library API | Unlimited, no key | Primary book data source |
| Google Books API | 1,000 req/day | Fallback only — rarely hit |

Cover images are served directly from Open Library CDN — we never store images,
just cache the URL. This keeps file storage at effectively zero.

---

## What's NOT in v1 (but schema supports)

- Multi-library support (schema has `library_id` everywhere — just add an invite system)
- Loan tracking with due dates (add `loan_due_date` to `library_books`)
- Series tracking (add `series_name`, `series_position` to `book_editions`)
- Reading history log (add a `reading_sessions` table)
- Book value tracking (eBay/AbeBooks API lookup)
