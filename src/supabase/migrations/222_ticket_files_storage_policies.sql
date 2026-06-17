-- 222_ticket_files_storage_policies.sql
--
-- Fix: inbox document attachments never persisted. The `ticket-files` storage
-- bucket (private) had NO row-level policies on storage.objects — only the
-- `attachments` and `avatars` buckets did. With storage RLS on and no policy,
-- every authenticated upload to `ticket-files` was denied by default, so
-- ComposeBox/ComposePanel hit `uploadErr` and `continue`d past the
-- ticket_attachments insert — leaving zero file attachments (715 attachments in
-- the DB, all `entity`, none `file`). Downloads would have failed too (private
-- bucket, no SELECT policy).
--
-- Gate storage access to the SAME ticket-visibility check that already guards
-- ticket_messages / ticket_attachments, so a file is uploadable/downloadable
-- exactly when you can see its ticket. Upload path is
-- `tickets/{ticketId}/{messageId}/{filename}`, so foldername()[2] = ticketId.

drop policy if exists ticket_files_rw on storage.objects;

create policy ticket_files_rw on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'ticket-files'
    and public.current_user_can_view_ticket(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'ticket-files'
    and public.current_user_can_view_ticket(((storage.foldername(name))[2])::uuid)
  );
