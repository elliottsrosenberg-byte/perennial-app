import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · Perennial",
  description: "How Perennial collects, uses, and protects your data.",
};

// Update both `EFFECTIVE_DATE` and the change-log paragraph in §11 whenever the
// policy materially changes — Google's OAuth verification reviews compare the
// current policy to the one approved at last verification.
const EFFECTIVE_DATE = "May 16, 2026";

const SECTION = {
  fontFamily: "var(--font-newsreader)",
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: "var(--color-charcoal, #1f211a)",
  marginTop: 36,
  marginBottom: 12,
} as const;

const SUBSECTION = {
  fontFamily: "var(--font-newsreader)",
  fontSize: 16,
  fontWeight: 600,
  color: "var(--color-charcoal, #1f211a)",
  marginTop: 20,
  marginBottom: 8,
} as const;

const BODY = {
  fontSize: 14,
  lineHeight: 1.7,
  color: "#3a3a32",
  marginBottom: 14,
} as const;

const LIST = {
  ...BODY,
  paddingLeft: 22,
  marginBottom: 14,
} as const;

export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: "#f9f5ec", minHeight: "100vh" }}>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: "0.5px solid rgba(31,33,26,0.12)",
          background: "#f5f1e9",
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href="/" aria-label="Perennial home" style={{ display: "inline-flex" }}>
            <Image
              src="/Logotype.svg"
              alt="Perennial"
              width={130}
              height={30}
              priority
              style={{ height: "auto" }}
            />
          </Link>
          <nav style={{ display: "flex", gap: 18, fontSize: 12, color: "#6b6860" }}>
            <Link href="/legal/terms" style={{ color: "inherit", textDecoration: "none" }}>
              Terms
            </Link>
            <Link href="/login" style={{ color: "inherit", textDecoration: "none" }}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "56px 24px 96px",
        }}
      >
        <p
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#8a8780",
            marginBottom: 10,
          }}
        >
          Legal
        </p>
        <h1
          style={{
            fontFamily: "var(--font-newsreader)",
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "var(--color-charcoal, #1f211a)",
            marginBottom: 14,
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ fontSize: 12, color: "#8a8780", marginBottom: 36 }}>
          Effective {EFFECTIVE_DATE}
        </p>

        <p style={BODY}>
          This Privacy Policy describes how Perennial (&ldquo;Perennial,&rdquo;{" "}
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses,
          and protects information about people who use the Perennial application at{" "}
          <strong>app.perennial.design</strong> (the &ldquo;Service&rdquo;). It
          applies to your use of the Service through any interface — the web app,
          any future native client, and the Perennial API.
        </p>
        <p style={BODY}>
          Perennial is built for independent designers, artists, and makers, and we
          treat your work and your relationships with the discretion they deserve.
          The short version: <strong>we collect only what the product needs to
          function, we do not sell or rent any of it, we do not use your content or
          any connected-service data to train AI models, and you can export or delete
          your data at any time.</strong>
        </p>

        {/* ─────────────────────────── 1 ─────────────────────────── */}
        <h2 style={SECTION}>1. Information we collect</h2>

        <h3 style={SUBSECTION}>a. Information you provide directly</h3>
        <p style={BODY}>
          When you create an account we collect your name, email address, and
          password (stored as a salted hash; we never have access to the cleartext).
          You may also choose to provide profile information such as your studio
          name, location, profession, bio, and a profile photo.
        </p>
        <p style={BODY}>
          When you use the Service we store the content you create: projects,
          notes, tasks, contacts, leads, activity log entries, files, invoices,
          expenses, time logs, and the prompts and responses exchanged with our
          AI assistant (&ldquo;Ash&rdquo;).
        </p>

        <h3 style={SUBSECTION}>b. Information from connected services</h3>
        <p style={BODY}>
          If you connect a third-party service — for example Google Workspace,
          Microsoft 365, Apple iCloud, a banking provider, a newsletter platform,
          or a social platform — we receive the data those services share with us
          under the OAuth scopes (or app-specific password) you authorize. The
          specific Google user data we access is described in detail in{" "}
          <a href="#section-google" style={{ color: "#3d6b4f" }}>
            Section 4
          </a>
          .
        </p>

        <h3 style={SUBSECTION}>c. Automatically collected information</h3>
        <p style={BODY}>
          When you use the Service we receive standard server logs containing your
          IP address, browser user-agent, timestamps, request paths, and error
          traces. We use this information for security, debugging, and to maintain
          the Service. We do not use third-party advertising trackers or
          cross-site advertising identifiers.
        </p>

        <h3 style={SUBSECTION}>d. Cookies and similar technologies</h3>
        <p style={BODY}>
          We use cookies that are strictly necessary to authenticate you and keep
          you signed in. We do not use cookies for cross-site tracking, advertising,
          or profiling.
        </p>

        {/* ─────────────────────────── 2 ─────────────────────────── */}
        <h2 style={SECTION}>2. How we use information</h2>
        <p style={BODY}>We use the information we collect to:</p>
        <ul style={LIST}>
          <li>Provide, maintain, secure, and improve the Service;</li>
          <li>Authenticate you and protect your account;</li>
          <li>Render your content and data from your connected services inside the app;</li>
          <li>
            Send transactional emails (account verification, password resets,
            billing receipts, and invoices you explicitly send to clients);
          </li>
          <li>Respond to your support requests;</li>
          <li>Detect, prevent, and respond to fraud, abuse, or security incidents;</li>
          <li>Comply with our legal obligations.</li>
        </ul>
        <p style={BODY}>
          <strong>We do not:</strong>
        </p>
        <ul style={LIST}>
          <li>Sell your personal information, your content, or any data from your connected services;</li>
          <li>
            Use your content or any connected-service data (including Google user
            data) to train, fine-tune, or otherwise improve generalized or
            non-personalized machine-learning or AI models;
          </li>
          <li>Use your data for advertising, ad targeting, ad profiling, or data brokerage;</li>
          <li>Use your data for credit assessment, lending decisions, or financial profiling.</li>
        </ul>
        <p style={BODY}>
          When Ash processes your content to answer a request you make, the
          processing is performed through a third-party model provider (currently
          Anthropic) under contractual terms that prohibit that provider from
          training models on your content.
        </p>

        {/* ─────────────────────────── 3 ─────────────────────────── */}
        <h2 style={SECTION}>3. Sharing and disclosure</h2>
        <p style={BODY}>We share information only as follows:</p>
        <ul style={LIST}>
          <li>
            <strong>Service providers (subprocessors)</strong> who help us run the
            Service under contractual data-protection terms — including our hosting
            and database provider (Supabase, on AWS infrastructure in the United
            States), our transactional-email provider (Resend), and our AI model
            provider (Anthropic). Each subprocessor receives the minimum data
            needed to perform its function.
          </li>
          <li>
            <strong>With your explicit direction</strong>, such as when you publish
            a public share link for a note, send an invoice to a client through the
            Service, or connect a third-party integration.
          </li>
          <li>
            <strong>For legal reasons</strong>, when we believe in good faith that
            disclosure is necessary to comply with valid legal process or protect
            the rights, property, or safety of Perennial, our users, or the public.
          </li>
          <li>
            <strong>In a business transfer</strong>, such as a merger, acquisition,
            or sale of assets. In that event we will provide advance notice and you
            will be given a meaningful opportunity to delete your data before the
            transfer takes effect.
          </li>
        </ul>
        <p style={BODY}>
          We do not share your content or your Google user data with advertisers,
          data brokers, or any party for purposes unrelated to operating the
          Service for you.
        </p>

        {/* ─────────────────────────── 4 ─────────────────────────── */}
        <h2 id="section-google" style={SECTION}>
          4. Google user data &amp; Limited Use disclosure
        </h2>
        <p style={BODY}>
          If you choose to connect a Google account, you authorize Perennial to
          access specific Google data through Google&rsquo;s OAuth consent flow.
          The scopes we may request, the data they grant access to, and how we use
          that data, are:
        </p>

        <div style={{ overflowX: "auto", marginBottom: 18 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              color: "#3a3a32",
            }}
          >
            <thead>
              <tr style={{ background: "#efeadd", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", borderBottom: "0.5px solid #d8d2c2", fontWeight: 600 }}>
                  Scope
                </th>
                <th style={{ padding: "10px 12px", borderBottom: "0.5px solid #d8d2c2", fontWeight: 600 }}>
                  Data accessed
                </th>
                <th style={{ padding: "10px 12px", borderBottom: "0.5px solid #d8d2c2", fontWeight: 600 }}>
                  How we use it
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  <code>gmail.readonly</code>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  Metadata of messages in your Gmail account (sender, recipients,
                  subject, date) and a short snippet (~200 characters).
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  Automatically log a corresponding activity entry against any
                  contact in your Perennial People module whose email address
                  matches a sender or recipient. We do not store full email
                  bodies; if you open an activity row and request the full
                  message, we fetch it from Gmail in real time and discard it
                  after display.
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  <code>calendar</code>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  Events on the calendars you authorize, including title, time,
                  attendees, and description.
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  Surface events on the Perennial calendar, and create a
                  &ldquo;meeting&rdquo; activity entry for any event whose
                  attendees include a contact in your People module.
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  <code>contacts.readonly</code>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  Your Google contact entries (name, email, phone, organization,
                  notes).
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "0.5px solid #e3dccb", verticalAlign: "top" }}>
                  One-time and ongoing import into your Perennial People module,
                  for contacts you choose to import.
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                  <code>openid</code>, <code>email</code>, <code>profile</code>
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                  Your basic Google profile (name, email address, profile
                  picture).
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                  Identify which Google account is connected and display it in
                  Settings.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={SUBSECTION}>Limited Use</h3>
        <p style={BODY}>
          Perennial&rsquo;s use and transfer to any other application of
          information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3d6b4f" }}
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically:
        </p>
        <ul style={LIST}>
          <li>
            We use Google user data <strong>only</strong> to provide and improve
            user-facing features that are prominent in the Perennial application
            interface.
          </li>
          <li>
            We do <strong>not</strong> transfer Google user data to others, except
            as necessary to provide or improve user-facing features, to comply
            with applicable law, or as part of a merger or acquisition with
            appropriate user notice and choice.
          </li>
          <li>
            We do <strong>not</strong> use Google user data to serve
            advertisements, including retargeting, personalized, or
            interest-based advertising.
          </li>
          <li>
            We do <strong>not</strong> allow humans to read Google user data,
            except (a) with your affirmative agreement to view specific messages,
            files, or other data; (b) for security purposes such as investigating
            a bug or abuse; (c) to comply with applicable law; or (d) where the
            data has been aggregated and de-identified for internal operations.
          </li>
          <li>
            We do <strong>not</strong> use Google user data to develop, improve,
            train, or fine-tune generalized or non-personalized AI or
            machine-learning models.
          </li>
        </ul>
        <p style={BODY}>
          You can revoke Perennial&rsquo;s access to your Google data at any time
          from your Google account at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3d6b4f" }}
          >
            myaccount.google.com/permissions
          </a>
          , or from within Perennial under Settings → Integrations.
        </p>

        {/* ─────────────────────────── 5 ─────────────────────────── */}
        <h2 style={SECTION}>5. Other connected services</h2>
        <p style={BODY}>
          Data we receive from Microsoft 365 (via Microsoft Graph), Apple iCloud
          (via IMAP, CalDAV, and CardDAV using an app-specific password you
          create), banking providers (Teller), newsletter providers (Mailchimp,
          Beehiiv), analytics providers (Google Analytics, Plausible), and social
          platforms (Instagram) is governed by the same principles set out for
          Google user data above: we use it only to provide the features you have
          enabled, we do not sell it, we do not share it with advertisers or data
          brokers, and we do not use it to train AI models.
        </p>

        {/* ─────────────────────────── 6 ─────────────────────────── */}
        <h2 style={SECTION}>6. Storage, security, and location</h2>
        <p style={BODY}>
          Your data is stored on infrastructure operated by Supabase, hosted in
          AWS data centers in the United States. Connections between your browser
          and our servers are encrypted in transit using HTTPS. OAuth access and
          refresh tokens for connected services are encrypted at rest.
        </p>
        <p style={BODY}>
          We follow industry-standard security practices, including least-
          privilege access controls for staff, row-level security policies that
          isolate each user&rsquo;s data, audit logging, and prompt patching of
          known vulnerabilities. No system is perfectly secure; if we become
          aware of a breach affecting your account we will notify you without
          undue delay and as required by applicable law.
        </p>

        {/* ─────────────────────────── 7 ─────────────────────────── */}
        <h2 style={SECTION}>7. Retention and deletion</h2>
        <p style={BODY}>
          We retain your account data for as long as your account is active. You
          have the following controls:
        </p>
        <ul style={LIST}>
          <li>
            <strong>Disconnect an integration</strong> at any time from Settings →
            Integrations. When you disconnect, we delete the stored OAuth tokens
            immediately. Activity entries already logged from that integration
            remain in your account unless you also delete them.
          </li>
          <li>
            <strong>Export your data</strong> from Settings → Account → Export.
            Data is provided in standard, portable formats.
          </li>
          <li>
            <strong>Delete your account</strong> from Settings → Account → Delete
            account. We permanently delete your content from our active systems
            within 30 days. Encrypted backups are purged on their normal rotation
            within 90 days.
          </li>
          <li>
            <strong>Request deletion of specific data</strong> by emailing{" "}
            <a href="mailto:privacy@perennial.design" style={{ color: "#3d6b4f" }}>
              privacy@perennial.design
            </a>
            . We will respond within 30 days.
          </li>
        </ul>
        <p style={BODY}>
          De-identified, aggregate analytics that cannot reasonably be tied back
          to an individual may be retained for product-improvement purposes after
          account deletion.
        </p>

        {/* ─────────────────────────── 8 ─────────────────────────── */}
        <h2 style={SECTION}>8. Your rights</h2>
        <p style={BODY}>
          Depending on where you live, you may have rights under laws such as the
          EU and UK General Data Protection Regulation (GDPR), the California
          Consumer Privacy Act as amended by the CPRA, and similar regimes. These
          may include the right to access, correct, port, restrict, or delete
          your personal information, and the right not to be subject to solely
          automated decision-making. To exercise any of these rights, email{" "}
          <a href="mailto:privacy@perennial.design" style={{ color: "#3d6b4f" }}>
            privacy@perennial.design
          </a>
          . We will not discriminate against you for exercising your rights.
        </p>
        <p style={BODY}>
          If you are in the EU or UK and believe we have not adequately addressed
          your concerns, you have the right to lodge a complaint with your local
          data-protection authority.
        </p>

        {/* ─────────────────────────── 9 ─────────────────────────── */}
        <h2 style={SECTION}>9. Children</h2>
        <p style={BODY}>
          Perennial is intended for use by adults (16 years of age and older). We
          do not knowingly collect information from children under 16. If you
          believe a child has provided us with personal information, please
          contact us at{" "}
          <a href="mailto:privacy@perennial.design" style={{ color: "#3d6b4f" }}>
            privacy@perennial.design
          </a>{" "}
          and we will delete it.
        </p>

        {/* ─────────────────────────── 10 ─────────────────────────── */}
        <h2 style={SECTION}>10. International transfers</h2>
        <p style={BODY}>
          Perennial is operated from the United States. If you use the Service
          from outside the United States, your information will be transferred
          to, stored in, and processed in the United States. Where required, we
          rely on legally recognized transfer mechanisms such as the European
          Commission&rsquo;s Standard Contractual Clauses.
        </p>

        {/* ─────────────────────────── 11 ─────────────────────────── */}
        <h2 style={SECTION}>11. Changes to this policy</h2>
        <p style={BODY}>
          If we materially change this policy — including any change to how we
          handle Google user data — we will update the &ldquo;Effective&rdquo;
          date at the top, notify signed-in users in the Service, and (for
          material changes affecting connected-service data) send an email
          notification. Continued use of the Service after a change takes effect
          constitutes acceptance of the updated policy.
        </p>

        {/* ─────────────────────────── 12 ─────────────────────────── */}
        <h2 style={SECTION}>12. Contact</h2>
        <p style={BODY}>
          For privacy questions, requests, or complaints:
        </p>
        <p style={BODY}>
          <strong>Email:</strong>{" "}
          <a href="mailto:privacy@perennial.design" style={{ color: "#3d6b4f" }}>
            privacy@perennial.design
          </a>
          <br />
          <strong>Postal:</strong> Perennial, 991 St. John&rsquo;s Place #3B,
          Brooklyn, NY 11213, USA
        </p>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "0.5px solid rgba(31,33,26,0.12)",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 11, color: "#8a8780", letterSpacing: "0.04em" }}>
          © {new Date().getFullYear()} Perennial · Effective {EFFECTIVE_DATE}
        </p>
      </footer>
    </div>
  );
}
