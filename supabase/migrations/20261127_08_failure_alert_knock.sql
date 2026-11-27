-- The founder's failure email was never sent on the first failed job (found Nov 27, 2026).
--
-- Two causes. pip-work gave up when no sender address was configured (fixed in the function: it now falls back to the
-- address Pip's other alerts use). And the database only knocked on pip-work while a job was due, so a failure with
-- nothing queued behind it would have waited for the next unrelated job. The knock now also happens while a job that
-- failed in the last day has not been emailed yet.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pip-work-tick', '* * * * *', $c$select net.http_post(url := rtrim(f.value #>> '{}', '/') || '/pip-work/tick', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb, timeout_milliseconds := 120000) from public.forge_settings f where f.key = 'functions_url' and (f.value #>> '{}') ~ '^https://[a-z0-9.-]+/functions/v1/?$' and exists (select 1 from public.work_jobs j where (j.status = 'queued' and j.run_after <= now()) or (j.status = 'running' and j.lease_until < now()) or (j.status = 'failed' and j.alerted_at is null and j.finished_at > now() - interval '1 day'))$c$);
  end if;
end $$;
-- undo (by hand): re-run the cron.schedule for pip-work-tick from 20261127_02_background_runtime.sql.
