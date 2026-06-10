-- 195_inbox_realtime.sql  (NEU-021 — inbox notifications appear late)
--
-- The sidebar notification badge is instant because notification_counters /
-- notification_recipients are in the `supabase_realtime` publication and
-- useNotifications() subscribes to them. The INBOX list is not: the ticket
-- tables were never published, so the inbox only refreshed on manual actions.
--
-- Publish the ticket tables so useInbox() can subscribe (mirrors the
-- notifications pattern). Idempotent — only adds tables not already published.

do $$
declare t text;
begin
  foreach t in array array['tickets','ticket_participants','ticket_messages','ticket_read_receipts']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end$$;
