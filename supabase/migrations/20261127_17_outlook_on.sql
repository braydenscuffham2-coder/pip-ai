-- Outlook calendar switched on (Nov 27, 2026), on Brayden's word, so it can be connected and tested.
-- The Portal's list of calendar sign-ins was Google only, which is why Outlook could not be chosen.
update public.tool_catalog set enabled = true where toolkit = 'outlook';
update public.connection_catalog set choices = choices || '[{"label": "Outlook Calendar", "toolkit": "outlook", "provider": "microsoft"}]'::jsonb
where slot = 'calendar' and not choices @> '[{"toolkit": "outlook"}]'::jsonb;
-- undo (by hand): update public.tool_catalog set enabled = false where toolkit = 'outlook';
--   update public.connection_catalog set choices = (select jsonb_agg(c) from jsonb_array_elements(choices) c where c->>'toolkit' <> 'outlook') where slot = 'calendar';
