-- The Forge's dollars as a limit line (Nov 27, 2026).
--
-- pip-piece (and the Forge's piece lane) reserve money with pip_take('forge_usd') before each model call. The Forge
-- already meters its builds under 'forge_usd' in spend_daily, with its own daily cap in forge_settings, but there was
-- no pip_limits line of that name, so pip_take answered "unknown_limit" and no piece could be drafted. This adds the
-- line. The day figure matches the Forge's own daily_cap_usd (15); the meter is the same one, so builds and pieces
-- count together.
insert into public.pip_limits (kind, label, per_day, per_month, per_visitor_hour, per_visitor_day, fn_cap, also_stop_if, pausable, note)
values ('forge_usd', 'Forge dollars on the Anthropic key (builds on the key, and pieces drafted for a business)', 15, 100, null, null, null, null, true,
        'Shares the spend_daily meter the Forge already writes. API-key builds also wait at forge_settings daily_cap_usd.')
on conflict (kind) do nothing;

-- undo (by hand): delete from public.pip_limits where kind = 'forge_usd';
