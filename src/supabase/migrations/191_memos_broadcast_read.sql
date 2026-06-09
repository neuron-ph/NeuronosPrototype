-- 191_memos_broadcast_read.sql
--
-- Release Notes / Announcements (the `memos` table) are BROADCAST content:
-- write-restricted (only memo managers may post/edit/delete), but read-by-all.
--
-- Phase 4 (162) flipped memos into RLS and gated SELECT on the owned-record
-- model: `current_user_has_module_permission('exec_memos','view') AND
-- current_user_can_view_record('memos', created_by)`. Two problems:
--   1. No access profile grants `exec_memos` at all — only 5 per-user overrides
--      have it — so the company-wide staff saw zero announcements.
--   2. Even with the view grant, the per-record dial (Staff='own') would hide
--      management's broadcasts from staff.
-- Both stem from modeling a bulletin board as a private owned record.
--
-- Fix: any authenticated user may read PUBLISHED memos. Drafts stay hidden
-- (there is no draft-save flow today — handlePublish always inserts
-- is_published=true — so this matches every real read path). INSERT/UPDATE/
-- DELETE are left untouched: posting stays gated on `exec_memos`.

alter policy memos_select on public.memos using (is_published);
