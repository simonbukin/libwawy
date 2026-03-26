export interface Library {
  id: string;
  name: string;
  join_code: string | null;
  created_at: string;
}

export interface LibraryMember {
  id: string;
  library_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string | null;
  color: string | null;
  joined_at: string;
}

export interface List {
  id: string;
  library_id: string;
  user_id: string;
  name: string;
  slug: string;
  is_default: boolean;
  created_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  edition_id: string;
  library_book_id: string | null;
  added_at: string;
  notes: string | null;
  position: number;
}

export interface ListItemWithEdition extends ListItem {
  book_editions: BookEdition;
}

export interface ListWithItems extends List {
  list_items: ListItemWithEdition[];
}

export interface BookEdition {
  id: string;
  isbn_13: string | null;
  isbn_10: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  published_year: number | null;
  language: string;
  format: string | null;
  page_count: number | null;
  cover_url: string | null;
  open_library_id: string | null;
  google_books_id: string | null;
  hardcover_id: string | null;
  description: string | null;
  genres: string[] | null;
  search_vector: string | null;
  fetched_at: string;
}

export interface LibraryBook {
  id: string;
  library_id: string;
  edition_id: string;
  added_by: string | null;
  added_at: string;
  condition: string;
  location: string | null;
  loaned_to: string | null;
  loaned_at: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  purchase_notes: string | null;
  read_status: "unread" | "reading" | "read" | "dnf";
  read_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  acquired_at: string | null;
  dates_read: string[] | null;
  rating: number | null;
  notes: string | null;
  removed_at: string | null;
  removed_reason: string | null;
  tags: string[];
}

export interface Wishlist {
  id: string;
  library_id: string;
  user_id: string;
  edition_id: string;
  added_at: string;
  priority: number;
  notes: string | null;
  fulfilled_at: string | null;
}

export interface BookWithEdition extends LibraryBook {
  book_editions: BookEdition;
  added_by_name?: string | null;
}

export interface WishlistWithEdition extends Wishlist {
  book_editions: BookEdition;
}
