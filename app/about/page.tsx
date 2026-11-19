// /about: the plain description of Pip that Google's review reads as the app's home page.
// Every statement here must be true of the product today. Do not add features, numbers, customer names,
// prices or certifications. The Google section lists what Pip asks Google for and must match the sign-in screen.
import type { Metadata } from 'next';
import { PublicShell } from '@/components/legal/PublicShell';
import { CONTACT_EMAIL } from '@/lib/legal/facts';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'About Pip · AI teammates for local businesses',
  description: 'What Pip is, what an AI teammate does, and how Pip uses your Google account if you connect it.',
};

export default function AboutPage() {
  return (
    <PublicShell current="about">
      <h1>AI teammates for local businesses</h1>
      <p className="pub-lead">
        Pip sets up AI teammates for local businesses. A teammate is software that uses AI to answer your customers
        and do routine jobs for you. You choose what it does.
      </p>
      <p className="pub-cta">
        <a className="pub-btn primary" href="/">See Pip work on your business</a>
        <a className="pub-btn ghost" href="/portal.html">Owner sign-in</a>
      </p>

      <h2 id="teammates">What a teammate does</h2>
      <p>You choose what a teammate does when you set it up. For example, a teammate can:</p>
      <ul>
        <li>Answer a customer&apos;s question in the chat on your website, using the facts you gave it about your business.</li>
        <li>Take down a lead or a booking request and pass it to you.</li>
        <li>Send an email you have set it up to send.</li>
        <li>Check when you are free and add a hold or a booking to your calendar.</li>
        <li>Save a row, such as a lead, to a sheet.</li>
      </ul>
      <p>A teammate is AI, and AI can make mistakes. Every teammate says it is an AI in its first message.</p>

      <h2 id="google">How Pip uses your Google account</h2>
      <p>If you connect your Google account, Pip asks Google for three things.</p>
      <ul className="pub-perms">
        <li>
          <h3>Send email on your behalf</h3>
          <p className="pub-scopes"><code>gmail.send</code></p>
          <p>A teammate sends the messages you have set it up to send, from your address.</p>
          <p className="pub-no">Pip cannot read, search or delete your mail.</p>
        </li>
        <li>
          <h3>See and add events on your calendar</h3>
          <p className="pub-scopes"><code>calendar.events</code> <code>calendar.calendars.readonly</code></p>
          <p>
            A teammate checks when you are free and adds a hold or a booking. Pip reads the time zone of your
            calendar so the hold lands on the right calendar at the right time.
          </p>
        </li>
        <li>
          <h3>Files Pip itself created</h3>
          <p className="pub-scopes"><code>drive.file</code></p>
          <p>Pip makes one sheet in your Drive, the Pip sheet, and saves rows to it, such as leads.</p>
          <p className="pub-no">Pip cannot see your other files.</p>
        </li>
      </ul>

      <h3>What Pip does not do with your Google data</h3>
      <ul>
        <li>Pip does not sell it.</li>
        <li>Pip does not use it for ads.</li>
        <li>Pip does not use it to train AI models.</li>
      </ul>

      <h3>You can disconnect at any time</h3>
      <p>
        Disconnect Google in the <a href="/portal.html">Pip Portal</a>, or on the{' '}
        <a href="https://myaccount.google.com/connections" rel="noopener noreferrer">third-party access page</a> of your
        Google account.
      </p>

      <h2 id="policies">Privacy and terms</h2>
      <p>
        Read the <a href="/privacy">Privacy Policy</a> and the <a href="/terms">Terms of Service</a>.
      </p>
      {CONTACT_EMAIL ? (
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      ) : null}
    </PublicShell>
  );
}
