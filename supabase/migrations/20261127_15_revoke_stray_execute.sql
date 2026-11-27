-- Two functions the public key could still call (Nov 27, 2026 ops check).
--
-- Every other function open to the public key takes a shared secret and checks it. These two did not need to be open:
--   bump_fingerprint  runs with the caller's rights, so with the public key it could only fail on the table's row
--                     security. scan-run calls it with the service key.
--   work_cost_cap     is a trigger function; it does nothing when called directly.
-- Neither could be used to read or change anything. This closes them so the list of open functions is only the
-- twelve that are meant to be.
revoke all on function public.bump_fingerprint(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_fingerprint(text, text, text) to service_role;
revoke all on function public.work_cost_cap() from public, anon, authenticated;

-- undo (by hand): grant execute on function public.bump_fingerprint(text, text, text) to public;
--   grant execute on function public.work_cost_cap() to public;
