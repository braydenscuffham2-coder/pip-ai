-- Conversations are kept for 13 months, then deleted. The Privacy Policy says so; this is what makes it true.
--
-- What goes, once a day:
--   conversations   a customer's chat, text or call with a teammate, 13 months after its LAST message
--                   (messages go with it; a call record keeps its row and loses the link)
--   notifications   the leads, booking requests and drafts a teammate took for the owner, 13 months after they were made
--
-- What this does not touch: Pip's own orders and sign-ups (the `leads` table is Pip's own list of owners who asked
-- for a build, not a business's customers), opt-out and consent records, the compliance log and agreements. Those have
-- their own periods in portal_purge_old.
--
-- 13 months was decided by Brayden on November 19, 2026. To change it, change it here and in legal/privacy-policy.md
-- section 9 in the same pull request.
create or replace function public.pip_purge_conversations()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare n_conv int; n_note int; cutoff timestamptz := now() - interval '13 months';
begin
  delete from public.conversations c
   where c.created_at < cutoff
     and not exists (select 1 from public.messages m where m.conversation_id = c.id and m.created_at >= cutoff);
  get diagnostics n_conv = row_count;
  delete from public.notifications n where n.created_at < cutoff;
  get diagnostics n_note = row_count;
  return jsonb_build_object('conversations_removed', n_conv, 'notes_removed', n_note, 'older_than', cutoff);
end $$;

revoke all on function public.pip_purge_conversations() from public, anon, authenticated;
grant execute on function public.pip_purge_conversations() to service_role;

-- Once a day. Skipped where the scheduler is not installed (the test database).
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('pip-conversations-purge') where exists (select 1 from cron.job where jobname = 'pip-conversations-purge');
    perform cron.schedule('pip-conversations-purge', '31 9 * * *', $$select public.pip_purge_conversations()$$);
  end if;
end $do$;
