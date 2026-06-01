create or replace function increment_view_count(p_slug text)
returns void language sql as $$
  update artifacts set view_count = view_count + 1 where slug = p_slug;
$$;
