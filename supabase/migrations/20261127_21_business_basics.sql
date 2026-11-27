-- What a business tells its team (Nov 27, 2026).
--
-- On the first real phone call the teammate did not know the business's hours: the only facts it had were the few
-- written when it was built. The owner now types the basics once in the Portal (Setup, "What your team knows") and
-- every teammate on every channel is given them. Only known fields, cleaned and cut to length, are ever saved
-- (cleanBasics in _shared/basics.ts); the check below is the database's own limit on size and shape.
alter table public.businesses add column if not exists basics jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_basics_chk') then
    alter table public.businesses add constraint businesses_basics_chk
      check (jsonb_typeof(basics) = 'object' and octet_length(basics::text) <= 4000);
  end if;
end $$;

-- TEST Fork is a made-up restaurant used for end-to-end checks. These are made-up facts so a test call has something
-- to answer from. They are set only if nothing has been typed yet.
update public.businesses set basics = jsonb_build_object(
    'hours', 'Tuesday to Thursday 5 pm to 9 pm. Friday and Saturday 5 pm to 10 pm. Sunday 4 pm to 8 pm. Closed Monday.',
    'address', '100 Example Street, Boise (a made-up address for testing)',
    'parking', 'Free lot behind the building, and street parking after 6.',
    'payments', 'Cards and cash. No checks.',
    'booking', 'Reservations for any size party. The private dining room seats up to 40 and needs a week''s notice.',
    'notes', 'This is a test business. Dogs are welcome on the patio. The kitchen closes 30 minutes before closing. Gluten-free and vegetarian options are on the menu.')
 where id = '38794f73-3586-475b-b428-da75f29e6a27' and basics = '{}'::jsonb;

-- undo (by hand): alter table public.businesses drop constraint businesses_basics_chk, drop column basics;
