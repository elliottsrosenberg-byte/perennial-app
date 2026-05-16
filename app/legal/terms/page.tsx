import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service · Perennial",
  description: "The terms that govern your use of Perennial.",
};

// Update `EFFECTIVE_DATE` whenever the Terms materially change.
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

export default function TermsOfServicePage() {
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
            <Link href="/legal/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
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
          Terms of Service
        </h1>
        <p style={{ fontSize: 12, color: "#8a8780", marginBottom: 36 }}>
          Effective {EFFECTIVE_DATE}
        </p>

        <p style={BODY}>
          These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to
          and use of Perennial, the application available at{" "}
          <strong>app.perennial.design</strong> (the &ldquo;Service&rdquo;),
          operated by Perennial (&ldquo;Perennial,&rdquo; &ldquo;we,&rdquo;{" "}
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
        </p>
        <p style={BODY}>
          By creating an account or otherwise using the Service, you agree to be
          bound by these Terms and by our{" "}
          <Link href="/legal/privacy" style={{ color: "#3d6b4f" }}>
            Privacy Policy
          </Link>
          . If you do not agree, do not use the Service.
        </p>

        {/* ─────────────────────────── 1 ─────────────────────────── */}
        <h2 style={SECTION}>1. Eligibility</h2>
        <p style={BODY}>
          You must be at least 16 years old to use the Service, and you must have
          the legal capacity to enter into a binding contract in the jurisdiction
          where you reside. If you use the Service on behalf of an organization,
          you represent that you have authority to bind that organization to
          these Terms, in which case &ldquo;you&rdquo; refers to that organization.
        </p>

        {/* ─────────────────────────── 2 ─────────────────────────── */}
        <h2 style={SECTION}>2. Your account</h2>
        <p style={BODY}>
          You are responsible for safeguarding your account credentials and for
          all activity that occurs under your account. You agree to:
        </p>
        <ul style={LIST}>
          <li>Provide accurate, complete, and current information when you register;</li>
          <li>Keep your password confidential and not share your account with others;</li>
          <li>Notify us promptly at <a href="mailto:security@perennial.design" style={{ color: "#3d6b4f" }}>security@perennial.design</a> if you suspect your account has been compromised.</li>
        </ul>
        <p style={BODY}>
          We are not liable for losses resulting from unauthorized use of your
          account that arises from your failure to follow these requirements.
        </p>

        {/* ─────────────────────────── 3 ─────────────────────────── */}
        <h2 style={SECTION}>3. Subscription &amp; fees</h2>
        <p style={BODY}>
          The Service is currently offered in beta, and some features may be
          provided free of charge. We may introduce paid plans, usage limits, or
          add-on features in the future. If we do, we will give you advance
          notice and the opportunity to choose whether to subscribe before any
          charges apply.
        </p>
        <p style={BODY}>
          If you subscribe to a paid plan, you authorize us (and our payment
          processor) to charge the payment method you provide for all applicable
          fees and taxes. Unless otherwise stated, subscriptions renew
          automatically at the end of each billing period until you cancel. You
          may cancel at any time from Settings → Billing; cancellation takes
          effect at the end of the then-current billing period and refunds for
          partial periods are not provided unless required by law.
        </p>

        {/* ─────────────────────────── 4 ─────────────────────────── */}
        <h2 style={SECTION}>4. Acceptable use</h2>
        <p style={BODY}>You agree not to:</p>
        <ul style={LIST}>
          <li>Use the Service in violation of any applicable law or regulation;</li>
          <li>
            Upload, store, or transmit content that is unlawful, infringes
            another&rsquo;s rights, is defamatory, harassing, hateful, or sexually
            exploitative of minors;
          </li>
          <li>
            Attempt to gain unauthorized access to the Service, other
            users&rsquo; accounts, or our infrastructure, or to interfere with
            the integrity or performance of the Service;
          </li>
          <li>
            Reverse-engineer, decompile, or otherwise attempt to derive the
            source code of any component of the Service, except to the extent
            applicable law expressly permits;
          </li>
          <li>
            Use automated means (bots, scrapers) to access the Service in a way
            that imposes an unreasonable load, except for accessing your own
            data through our public API;
          </li>
          <li>
            Resell, sublicense, or commercially redistribute the Service or any
            part of it without our written permission;
          </li>
          <li>
            Use the Service to send unsolicited commercial messages, phishing
            attempts, or malware.
          </li>
        </ul>

        {/* ─────────────────────────── 5 ─────────────────────────── */}
        <h2 style={SECTION}>5. Your content</h2>
        <p style={BODY}>
          You retain all ownership of any content you create, upload, or import
          into the Service (&ldquo;Your Content&rdquo;), including projects,
          notes, tasks, contact records, activity entries, files, invoices, and
          any output you save from your conversations with Ash.
        </p>
        <p style={BODY}>
          You grant Perennial a limited, worldwide, non-exclusive,
          royalty-free license to host, store, transmit, display, and process
          Your Content solely as necessary to operate the Service for you and to
          perform the features you have enabled. This license ends when you
          delete Your Content or your account, except to the extent that we are
          required to retain copies for legal compliance or have backups subject
          to normal rotation.
        </p>
        <p style={BODY}>
          We do not use Your Content, or data we receive from any connected
          service, to train, fine-tune, or improve generalized or
          non-personalized AI or machine-learning models.
        </p>
        <p style={BODY}>
          You are responsible for the legality of Your Content and for ensuring
          you have the rights necessary to upload it.
        </p>

        {/* ─────────────────────────── 6 ─────────────────────────── */}
        <h2 style={SECTION}>6. Connected services</h2>
        <p style={BODY}>
          If you connect a third-party service to Perennial (for example Google
          Workspace, Microsoft 365, Apple iCloud, a banking provider, a
          newsletter platform, or a social platform), you authorize us to access
          and process data from that service under the scopes you grant, as
          described in our{" "}
          <Link href="/legal/privacy" style={{ color: "#3d6b4f" }}>
            Privacy Policy
          </Link>
          . Your use of each third-party service remains governed by that
          service&rsquo;s own terms and privacy policy. We are not responsible
          for the availability, accuracy, or behavior of any third-party
          service.
        </p>

        {/* ─────────────────────────── 7 ─────────────────────────── */}
        <h2 style={SECTION}>7. Ash and AI-generated content</h2>
        <p style={BODY}>
          The Service includes an AI assistant (&ldquo;Ash&rdquo;) that can
          generate text, summaries, suggestions, and other content based on your
          prompts and on Your Content. AI output is probabilistic and can be
          incomplete, inaccurate, or unsuitable for a particular purpose. You
          are responsible for reviewing AI output before relying on it,
          publishing it, or using it to make decisions — particularly
          financial, legal, or medical decisions.
        </p>
        <p style={BODY}>
          We do not warrant that AI output will be accurate, complete, original,
          or free from third-party rights claims. To the extent permitted by
          law, Perennial disclaims liability for any losses arising from your
          use of AI output.
        </p>

        {/* ─────────────────────────── 8 ─────────────────────────── */}
        <h2 style={SECTION}>8. Beta service</h2>
        <p style={BODY}>
          The Service is currently provided in beta. Features may change, break,
          or be removed without notice as we develop the product. We may
          identify specific features as experimental, which means they are
          subject to additional risk of error or data loss; you use such
          features at your own risk.
        </p>

        {/* ─────────────────────────── 9 ─────────────────────────── */}
        <h2 style={SECTION}>9. Intellectual property</h2>
        <p style={BODY}>
          The Service, including all software, design, branding, documentation,
          and content provided by Perennial (other than Your Content), is owned
          by Perennial or its licensors and is protected by intellectual
          property laws. Subject to your compliance with these Terms, we grant
          you a limited, non-exclusive, non-transferable, non-sublicensable
          license to access and use the Service for your personal or internal
          business purposes.
        </p>
        <p style={BODY}>
          You may submit suggestions, feedback, or ideas about the Service to
          us. We may use any such feedback for any purpose without obligation to
          you.
        </p>

        {/* ─────────────────────────── 10 ─────────────────────────── */}
        <h2 style={SECTION}>10. Suspension &amp; termination</h2>
        <p style={BODY}>
          You may stop using the Service at any time and may delete your account
          from Settings → Account → Delete account. We may suspend or terminate
          your access to the Service, with or without notice, if we reasonably
          believe you have violated these Terms, if your use poses a security
          risk to the Service or other users, or if required to comply with
          applicable law.
        </p>
        <p style={BODY}>
          Upon termination of your account by either party, your right to use
          the Service ends. Sections of these Terms that by their nature should
          survive termination — including Sections 5, 7, 9, 11, 12, 13, 14, and
          15 — will continue to apply.
        </p>

        {/* ─────────────────────────── 11 ─────────────────────────── */}
        <h2 style={SECTION}>11. Disclaimers</h2>
        <p style={BODY}>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo;
          WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING ANY
          IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED,
          ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
        </p>
        <p style={BODY}>
          We do not warrant that any third-party service connected to Perennial
          will be available, accurate, or behave in a particular way, or that
          data synced from any such service will be complete or timely.
        </p>

        {/* ─────────────────────────── 12 ─────────────────────────── */}
        <h2 style={SECTION}>12. Limitation of liability</h2>
        <p style={BODY}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PERENNIAL NOR ITS
          OFFICERS, EMPLOYEES, AGENTS, OR SUBPROCESSORS WILL BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR
          ANY LOSS OF PROFITS, REVENUES, DATA, OR GOODWILL, ARISING OUT OF OR
          RELATED TO YOUR USE OF THE SERVICE — WHETHER BASED ON CONTRACT, TORT,
          STRICT LIABILITY, OR ANY OTHER LEGAL THEORY — EVEN IF WE HAVE BEEN
          ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p style={BODY}>
          OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATED TO THESE
          TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) ONE HUNDRED
          U.S. DOLLARS (US$100) OR (B) THE AMOUNT YOU PAID PERENNIAL IN THE
          TWELVE MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
        </p>
        <p style={BODY}>
          Some jurisdictions do not allow the exclusion or limitation of certain
          warranties or damages, so some of the above may not apply to you. In
          those jurisdictions, our liability is limited to the maximum extent
          permitted by law.
        </p>

        {/* ─────────────────────────── 13 ─────────────────────────── */}
        <h2 style={SECTION}>13. Indemnification</h2>
        <p style={BODY}>
          You agree to defend, indemnify, and hold harmless Perennial and its
          officers, employees, agents, and subprocessors from and against any
          claims, damages, liabilities, and expenses (including reasonable
          attorneys&rsquo; fees) arising out of or related to (a) Your Content,
          (b) your use of the Service in violation of these Terms or applicable
          law, or (c) your violation of any third-party right.
        </p>

        {/* ─────────────────────────── 14 ─────────────────────────── */}
        <h2 style={SECTION}>14. Changes to these Terms</h2>
        <p style={BODY}>
          We may update these Terms from time to time. If we make a material
          change, we will revise the &ldquo;Effective&rdquo; date at the top and
          notify signed-in users in the Service or by email. Your continued use
          of the Service after a change takes effect constitutes acceptance of
          the updated Terms. If you do not agree to the updated Terms, you must
          stop using the Service.
        </p>

        {/* ─────────────────────────── 15 ─────────────────────────── */}
        <h2 style={SECTION}>15. Governing law &amp; disputes</h2>
        <p style={BODY}>
          These Terms are governed by the laws of the State of New York, without
          regard to its conflict-of-laws principles. The exclusive venue for any
          dispute arising out of or related to these Terms or the Service is the
          state and federal courts located in Kings County, New York, and you
          consent to the personal jurisdiction of those courts. Nothing in this
          section prevents either party from seeking injunctive or other
          equitable relief in any court of competent jurisdiction to protect its
          intellectual property or confidential information.
        </p>

        {/* ─────────────────────────── 16 ─────────────────────────── */}
        <h2 style={SECTION}>16. Miscellaneous</h2>
        <p style={BODY}>
          These Terms (together with the Privacy Policy and any other notices we
          publish through the Service) constitute the entire agreement between
          you and Perennial regarding the Service and supersede any prior
          agreements on the same subject. If any provision of these Terms is
          held to be unenforceable, the remaining provisions will remain in full
          force and effect. Our failure to enforce any provision is not a waiver
          of that provision. You may not assign these Terms without our prior
          written consent; we may assign them to an affiliate or in connection
          with a merger, acquisition, or sale of assets.
        </p>

        {/* ─────────────────────────── 17 ─────────────────────────── */}
        <h2 style={SECTION}>17. Contact</h2>
        <p style={BODY}>
          Questions about these Terms can be sent to:
        </p>
        <p style={BODY}>
          <strong>Email:</strong>{" "}
          <a href="mailto:legal@perennial.design" style={{ color: "#3d6b4f" }}>
            legal@perennial.design
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
