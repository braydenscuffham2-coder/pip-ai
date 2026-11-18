-- The scheduler keeps a row for every run of every timer and never clears them. Three timers run every two minutes,
-- so this was already the biggest table in the database after four weeks. Keep two weeks, clear the rest weekly.
select cron.unschedule('pip-cron-history-clean') where exists (select 1 from cron.job where jobname = 'pip-cron-history-clean');
select cron.schedule('pip-cron-history-clean', '13 9 * * 0', $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$);
