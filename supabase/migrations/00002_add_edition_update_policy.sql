create policy "authenticated users can update editions"
  on book_editions for update
  using (auth.uid() is not null);
