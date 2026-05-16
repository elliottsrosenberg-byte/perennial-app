// Shared types for the integrations layer. Every provider — Google,
// Microsoft, Apple iCloud, Mailchimp, Beehiiv, Teller, etc. — plugs into
// the same ProviderAdapter shape so the OAuth start/callback routes,
// the Settings UI, the sync workers, and the onboarding step all stay
// uniform.
//
// The DB shape is `public.integrations` (one row per user × provider ×
// account_id). Tokens are stored encrypted in supabase_vault and looked
// up by `access_token_secret_id` / `refresh_token_secret_id`.

export type ProviderId =
  | "google"            // unified Gmail + Calendar + Contacts (People module)
  | "google_analytics"  // standalone, kept separate for Presence module
  | "google_calendar"   // legacy — superseded by `google`, kept until migration
  | "microsoft"         // Outlook Mail + Calendar + Contacts via MS Graph
  | "apple_icloud"      // Mail (IMAP) + Calendar (CalDAV) + Contacts (CardDAV)
  | "instagram"
  | "plausible"
  | "mailchimp"
  | "beehiiv"
  | "substack"          // manual entry, no API
  | "teller"            // banking
  | "stripe";

export type IntegrationStatus = "active" | "error" | "disconnected" | "pending";

/** A single row from `public.integrations`. Token secrets are NOT included
 *  here — they're fetched on demand via the vault RPCs. */
export interface IntegrationRow {
  id:                       string;
  user_id:                  string;
  provider:                 ProviderId | string;   // string fallback for old data
  account_id:               string | null;
  account_name:             string | null;
  scopes:                   Record<string, boolean>;
  sync_state:               Record<string, unknown>;
  status:                   IntegrationStatus;
  metadata:                 Record<string, unknown>;
  access_token_secret_id:   string | null;
  refresh_token_secret_id:  string | null;
  token_expires_at:         string | null;
  last_error:               string | null;
  last_error_at:            string | null;
  connected_at:             string | null;
  last_synced_at:           string | null;
  created_at:               string;
  updated_at:               string;
}

/** Tokens returned by an OAuth code exchange. */
export interface OAuthTokenSet {
  accessToken:   string;
  refreshToken:  string | null;
  expiresAt:     Date | null;
  scope:         string | null;
  idToken?:      string | null;
}

/** Identity of the connected account, returned by the provider after the
 *  OAuth exchange so we can dedupe on (user_id, provider, account_id). */
export interface ConnectedAccount {
  accountId:    string;        // the provider's stable user/account identifier
  accountName:  string;        // human-readable label (usually the email)
  metadata?:    Record<string, unknown>;
}

/** Every provider that supports OAuth implements this interface. */
export interface OAuthProviderAdapter {
  readonly id: ProviderId;

  /** Build the URL the user is redirected to in order to grant consent. */
  getAuthUrl(args: {
    state:        string;
    redirectUri:  string;
    scopes:       string[];
    /** Some providers (e.g. Google) need additional knobs like prompt=consent. */
    options?:     Record<string, string>;
  }): string;

  /** Exchange the authorization code for tokens + identify the account. */
  exchangeCode(args: {
    code:         string;
    redirectUri:  string;
  }): Promise<{ tokens: OAuthTokenSet; account: ConnectedAccount }>;

  /** Refresh an expired access token. */
  refreshTokens(refreshToken: string): Promise<OAuthTokenSet>;

  /** Best-effort revoke at the provider so the user's grant is cleaned up
   *  on their side too. Swallows errors — disconnect succeeds locally
   *  even if the provider call fails. */
  revoke?(accessToken: string): Promise<void>;
}
