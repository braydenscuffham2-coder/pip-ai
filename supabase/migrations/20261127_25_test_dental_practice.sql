-- A made-up dental practice for end-to-end tests, behind Pip's test phone number (Nov 27, 2026).
--
-- TEST Maple Street Dental is not a real business. It exists so the phone path can be tried against a teammate that
-- was written the way the Forge is meant to write them: with a job (contract teammate/1) that says what starts it,
-- which tools it has at which level, and its limits. The spec below passed checkSpec (_shared/teammate-spec.ts)
-- before it was put here.
--
-- It borrows TEST Fork's test Google Calendar and test Gmail sign-ins (the founder's own test accounts), so a booked
-- appointment lands on that test calendar and a confirmation email leaves from that test mailbox. The number
-- +1 208 248 7311 is moved from TEST Fork to this practice. Everything is undone by the statements at the bottom.
do $$
declare v_biz uuid := 'de57a1de-0000-4000-8000-000000000001'; v_order uuid := 'de57a1de-0000-4000-8000-000000000002'; v_spec uuid := 'de57a1de-0000-4000-8000-000000000003';
  v_fork uuid := '38794f73-3586-475b-b428-da75f29e6a27'; v_user text;
begin
  select composio_user_id into v_user from public.businesses where id = v_fork;
  insert into public.businesses (id, name, domain, industry, health_lane, state, timezone, status, owner_email, composio_user_id, price_accepted_at, basics)
  values (v_biz, 'TEST Maple Street Dental (made-up practice)', 'maplestreetdental.example', 'health', true, 'ID', 'America/Boise', 'building', 'test@example.com', v_user, now(),
    $basics${"hours": "Monday to Thursday 8 am to 5 pm. Friday 8 am to 1 pm. Closed Saturday and Sunday.", "address": "200 Example Avenue, Suite 4, Boise (a made-up address for testing)", "phone": "208-248-7311", "parking": "Free parking in the lot in front of the building. The entrance is on the ground floor.", "payments": "Cards, cash and checks. Payment is due at the visit. We take Delta Dental, MetLife, Cigna and Blue Cross of Idaho. We do not take Medicaid.", "booking": "Call or message to book. New patients are welcome and should arrive 10 minutes early with a photo ID and their insurance card.", "notes": "This is a made-up practice used for testing. Dr. Avery Lin is the dentist. A new patient exam with X-rays is 129 dollars without insurance. A cleaning is 99 dollars without insurance. We see children from age 3. We do not do braces or implants; we refer those out. Same-day visits for tooth pain when a time is open."}$basics$::jsonb)
  on conflict (id) do nothing;
  insert into public.build_orders (id, domain, "order", status, code, engine, source, business_id)
  values (v_order, 'maplestreetdental.example', jsonb_build_object('version', 'build-order/1', 'business', jsonb_build_object('name', 'TEST Maple Street Dental (made-up practice)'), 'owner', jsonb_build_object('name', 'Test Owner', 'email', 'test@example.com', 'message', 'Made-up practice for phone tests. Safe to delete.'),
      -- The Portal's manifest is compiled from the order's package: this is where the teammate's name comes from.
      'package', jsonb_build_object('agents', jsonb_build_array(jsonb_build_object('agent_id', 'dental-front-desk', 'name', 'Dental front desk', 'lane', 'spec',
        'teammate', jsonb_build_object('name', 'Owen', 'role', 'Front desk'), 'uses', jsonb_build_array('inbound_message', 'calendar', 'email', 'notify_owner', 'capture_lead', 'ai_disclosure'))))),
    'awaiting_golive', 'PIP-TDEN', 'board', 'test-fixture', v_biz)
  on conflict (id) do nothing;
  insert into public.skill_specs (id, business, domain, skill_id, version, status, spec, brain, order_id)
  values (v_spec, 'TEST Maple Street Dental (made-up practice)', 'maplestreetdental.example', 'dental-front-desk', 1, 'sandbox',
    $spec${"contract": "teammate/1", "name": "Dental front desk", "board": {"seats": {"gate": {"system_prompt": "You are Owen, the front desk for TEST Maple Street Dental, a general dental practice. You are an AI assistant. You answer the practice's phone, texts, website chat and email the way a good front-desk person would: warm, quick, plain words, short sentences. No em dashes.\n\nWHAT YOU DO\n1. Answer questions from the practice facts you are given: hours, address, parking, insurance, payment, what a first visit involves. If the facts do not cover it, say you are not sure and take a message.\n2. Book appointments yourself. Ask for the patient's first and last name, whether they are a new or returning patient, what the visit is for, and the day and time they want. Visit lengths: cleaning 60 minutes, checkup or exam 30 minutes, toothache or other problem 30 minutes. Only offer times inside opening hours. Look at the calendar for that time first. If it is free, add the appointment to the calendar with the title \"TEST appointment: <visit type>, <first name> <last name>\" and put the patient's phone number, new or returning, and the reason in the description. If it is taken, offer the nearest free times that day or the next open day. Say the day and time back once before you add it.\n3. After an appointment is on the calendar, say it is booked, with the day and time. Then ask if they would like the details by email. If they give an email address, send one short email with the day, time, address and a line asking them to call if they need to change it.\n4. To change or cancel an appointment, take the name, the appointment time and what they want instead, and alert the office. You cannot move or cancel appointments yourself, so do not say it is done.\n5. For anything else that needs a person (billing questions, records, a complaint, a referral), take a message with their name and number and alert the office.\n\nSAFETY\n- You never give medical or dental advice, never say what a symptom means, and never suggest a medicine or a dose.\n- If someone describes trouble breathing or swallowing, swelling that is spreading to the eye or neck, bleeding that will not stop, or an injury to the face or jaw, tell them to call 911 or go to an emergency room now, and alert the office as urgent.\n- For a toothache, a broken tooth or a lost filling, offer the earliest open time and alert the office as urgent.\n- Never ask for or repeat a card number, a Social Security number, an insurance member number or a password. If someone offers one, say you cannot take it and that the office will collect it at the visit.\n- Never quote a price that is not in the practice facts.\n\nHONESTY\n- Never say an appointment is booked unless the calendar tool said it was added. Never say an email was sent unless the email tool said so. If a tool fails, say so plainly and take a message.\n- You cannot send text messages yet. Do not offer to text.\n- This is a made-up practice used for testing. If asked, say so."}}}, "jobs": [{"id": "front_desk", "name": "Front desk", "does": "Answers callers and messages, books appointments on the practice calendar, emails the details when asked, and takes messages for the office.", "instructions": "Answer from the practice facts. Book appointments on the calendar after checking the time is free. Email the details only to an address the patient gave. Alert the office for anything that needs a person.", "triggers": [{"type": "message", "channels": ["voice", "web_chat", "sms", "email"]}], "tools": [{"tool": "pip", "records": "owner_alert", "can": ["add"]}, {"tool": "pip", "records": "lead", "can": ["add"]}, {"tool": "calendar", "records": "busy_time", "can": ["read"], "required": false}, {"tool": "calendar", "records": "appointment", "can": ["add"], "required": false}, {"tool": "email", "records": "message", "can": ["add"], "required": false, "purpose": "reply"}], "limits": {"per_run": {"steps": 6, "actions": 4}, "per_day": {"runs": 300, "actions": 300}}, "pause": {"on_limit": "wait", "after_failures": 3}}]}$spec$::jsonb,
    jsonb_build_object('facts', jsonb_build_array('TEST Maple Street Dental is a general dental practice: exams, cleanings, fillings, crowns and same-day visits for tooth pain.')), v_order)
  on conflict (id) do nothing;
  insert into public.agent_manifests (spec_id, business_id, skill_id, manifest)
  values (v_spec, v_biz, 'dental-front-desk', jsonb_build_object('version', 'manifest/1', 'name', 'Dental front desk', 'role', 'Front desk', 'teammate', 'Owen', 'skill_id', 'dental-front-desk'))
  on conflict (spec_id) do nothing;
  insert into public.business_connections (business_id, slot, status, choice, blocks_golive, agents, detail, connected_account_id, checked_at)
  select v_biz, c.slot, c.status, c.choice, c.blocks_golive, array['dental-front-desk'], '{}'::jsonb, c.connected_account_id, now()
    from public.business_connections c
   where c.business_id = v_fork and c.slot in ('calendar', 'email')
     and not exists (select 1 from public.business_connections x where x.business_id = v_biz and x.slot = c.slot);
  insert into public.members (business_id, email, role, status)
  select v_biz, 'test@example.com', 'owner', 'invited' where not exists (select 1 from public.members m where m.business_id = v_biz);
  -- On the test list, so this teammate (not live) may answer the test number and act with the test sign-ins.
  update public.forge_settings set value = value || to_jsonb(v_biz::text)
   where key = 'act_sandbox_businesses' and not (value ? v_biz::text);
  -- The test number moves from TEST Fork to the practice, keeping its voice.
  update public.phone_lines set business_id = v_biz, spec_id = v_spec, updated_at = now()
   where pip_number = '+12082487311' and business_id = v_fork
     and not exists (select 1 from public.phone_lines p where p.business_id = v_biz);
end $$;

-- undo (by hand), in this order:
--   update public.phone_lines set business_id = '38794f73-3586-475b-b428-da75f29e6a27', spec_id = '3b5b8524-c712-4cee-82ec-97e1565f33ff' where business_id = 'de57a1de-0000-4000-8000-000000000001';
--   update public.forge_settings set value = value - 'de57a1de-0000-4000-8000-000000000001' where key = 'act_sandbox_businesses';
--   update public.businesses set status = 'cancelled' where id = 'de57a1de-0000-4000-8000-000000000001';
