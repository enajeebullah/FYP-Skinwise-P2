-- Add call sessions to Supabase Realtime without changing table security.
-- Review and apply this migration separately; it is not run by the app.
do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication supabase_realtime does not exist';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.call_sessions';
  end if;
end
$$;
