-- ============================================================
-- libwawy: Shared Household Book Library
-- Initial Schema Migration
-- ============================================================

-- Tables

create table libraries (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  join_code    text unique,
  created_at   timestamptz default now()
);

create table library_members (
  id           uuid primary key default gen_random_uuid(),
  library_id   uuid references libraries(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  role         text not null default 'member',
  display_name text,
  joined_at    timestamptz default now(),
  unique(library_id, user_id)
);

create table book_editions (
  id              uuid primary key default gen_random_uuid(),
  isbn_13         text unique,
  isbn_10         text unique,
  title           text not null,
  subtitle        text,
  authors         text[] not null,
  publisher       text,
  published_year  int,
  language        text default 'en',
  format          text,
  page_count      int,
  cover_url       text,
  open_library_id text,
  google_books_id text,
  description     text,
  genres          text[],
  search_vector   tsvector,
  fetched_at      timestamptz default now()
);

create table library_books (
  id              uuid primary key default gen_random_uuid(),
  library_id      uuid references libraries(id) on delete cascade,
  edition_id      uuid references book_editions(id) on delete restrict,
  added_by        uuid references auth.users(id),
  added_at        timestamptz default now(),
  condition       text default 'good',
  location        text,
  loaned_to       text,
  loaned_at       timestamptz,
  purchase_price  numeric(8,2),
  purchase_date   date,
  purchase_notes  text,
  read_status     text default 'unread',
  read_by         uuid references auth.users(id),
  started_at      date,
  finished_at     date,
  rating          int check (rating between 1 and 5),
  notes           text,
  removed_at      timestamptz,
  removed_reason  text
);

create table wishlists (
  id              uuid primary key default gen_random_uuid(),
  library_id      uuid references libraries(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  edition_id      uuid references book_editions(id) on delete restrict,
  added_at        timestamptz default now(),
  priority        int default 3 check (priority between 1 and 5),
  notes           text,
  fulfilled_at    timestamptz,
  unique(user_id, edition_id)
);

-- Indexes

create index book_editions_search_idx on book_editions using gin(search_vector);

create index library_books_edition_idx on library_books(library_id, edition_id)
  where removed_at is null;

-- Functions

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

create or replace function my_library_ids()
returns setof uuid as $$
  select library_id from library_members where user_id = auth.uid()
$$ language sql security definer stable;

-- RLS

alter table libraries enable row level security;
alter table library_members enable row level security;
alter table book_editions enable row level security;
alter table library_books enable row level security;
alter table wishlists enable row level security;

-- libraries policies
create policy "members can view their libraries"
  on libraries for select
  using (id in (select my_library_ids()));

create policy "authenticated users can create libraries"
  on libraries for insert
  with check (auth.uid() is not null);

-- library_members policies
create policy "members can view library members"
  on library_members for select
  using (library_id in (select my_library_ids()));

create policy "authenticated users can insert library members"
  on library_members for insert
  with check (auth.uid() is not null);

-- book_editions policies
create policy "authenticated users can read editions"
  on book_editions for select
  using (auth.uid() is not null);

create policy "authenticated users can insert editions"
  on book_editions for insert
  with check (auth.uid() is not null);

-- library_books policies
create policy "members can view library books"
  on library_books for select
  using (library_id in (select my_library_ids()));

create policy "members can insert library books"
  on library_books for insert
  with check (library_id in (select my_library_ids()));

create policy "members can update library books"
  on library_books for update
  using (library_id in (select my_library_ids()));

-- wishlists policies
create policy "members can view all wishlists in library"
  on wishlists for select
  using (library_id in (select my_library_ids()));

create policy "users manage own wishlist"
  on wishlists for insert
  with check (user_id = auth.uid() and library_id in (select my_library_ids()));

create policy "users manage own wishlist update"
  on wishlists for update
  using (user_id = auth.uid());

create policy "users manage own wishlist delete"
  on wishlists for delete
  using (user_id = auth.uid());
