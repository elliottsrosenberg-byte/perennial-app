// Best-effort host detection from a user-provided website URL. Used by the
// Presence → Website tab's empty state to tailor GA4 install instructions
// to the platform the user is actually on. Custom domains can't be
// classified from URL alone, so they fall through to "unknown" and get
// the generic Google guide.

export type HostingPlatform =
  | "squarespace"
  | "cargo"
  | "webflow"
  | "wix"
  | "shopify"
  | "unknown";

export interface PlatformGuide {
  platform:       HostingPlatform;
  /** Human-readable platform name, e.g. "Squarespace". */
  label:          string;
  /** 3–5 short imperative steps. Empty for "unknown". */
  installSteps:   string[];
  /** Optional direct link into the platform's relevant settings page. */
  deepLinkUrl?:   string;
  /** CTA label for `deepLinkUrl`, e.g. "Open Squarespace Code Injection". */
  deepLinkLabel?: string;
  /** Platform-specific GA4 install help URL (or Google's generic one). */
  guideUrl:       string;
}

const GOOGLE_GENERIC_GUIDE =
  "https://support.google.com/analytics/answer/9304153";

/**
 * Classify a website URL by host pattern. Returns "unknown" for custom
 * domains, malformed input, or platforms we don't have a guide for.
 */
export function detectHostingPlatform(
  websiteUrl: string | null | undefined,
): HostingPlatform {
  if (!websiteUrl) return "unknown";

  // Normalize: strip protocol + leading/trailing whitespace and slashes,
  // then take just the host portion.
  let host = websiteUrl.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/\/.*$/, "");
  host = host.replace(/^www\./, "");
  if (!host) return "unknown";

  if (host.endsWith(".squarespace.com"))     return "squarespace";
  if (host.endsWith(".cargo.site"))          return "cargo";
  if (host.endsWith(".cargocollective.com")) return "cargo";
  if (host.endsWith(".webflow.io"))          return "webflow";
  if (host.endsWith(".wixsite.com"))         return "wix";
  if (host.endsWith(".wix.com"))             return "wix";
  if (host.endsWith(".myshopify.com"))       return "shopify";

  return "unknown";
}

const GUIDES: Record<HostingPlatform, PlatformGuide> = {
  squarespace: {
    platform: "squarespace",
    label: "Squarespace",
    installSteps: [
      "Open Settings → Advanced → Code Injection.",
      "Paste your GA4 measurement snippet into the HEADER field.",
      "Save. New visits start reporting within an hour.",
    ],
    // Squarespace doesn't expose deep-link URLs to admin sections.
    guideUrl:
      "https://support.squarespace.com/hc/en-us/articles/360022297392-Connecting-Google-Analytics",
  },
  cargo: {
    platform: "cargo",
    label: "Cargo",
    installSteps: [
      "Open Site Settings → Custom HTML.",
      "Paste your GA4 measurement snippet before the closing </head> tag.",
      "Save and publish. New visits start reporting within an hour.",
    ],
    // Cargo's public help docs don't have a stable GA4-specific article we
    // could verify; fall back to Google's generic guide rather than ship a
    // 404 link.
    guideUrl: GOOGLE_GENERIC_GUIDE,
  },
  webflow: {
    platform: "webflow",
    label: "Webflow",
    installSteps: [
      "Open Project Settings → Custom Code.",
      "Paste your GA4 measurement snippet into the Head Code field.",
      "Save, then publish your site.",
    ],
    guideUrl:
      "https://university.webflow.com/lesson/google-analytics-tracking-with-webflow",
  },
  wix: {
    platform: "wix",
    label: "Wix",
    installSteps: [
      "Open Settings → Marketing & SEO.",
      "Choose Marketing Integrations → Google Analytics.",
      "Click Connect — Wix has a native GA4 integration, no snippet pasting required.",
    ],
    guideUrl:
      "https://support.wix.com/en/article/connecting-your-site-to-google-analytics",
  },
  shopify: {
    platform: "shopify",
    label: "Shopify",
    installSteps: [
      "Install the Google & YouTube app from the Shopify App Store.",
      "Connect your Google account and pick the GA4 property.",
      "Confirm tracking is enabled in Online Store → Preferences.",
    ],
    guideUrl:
      "https://help.shopify.com/en/manual/promoting-marketing/analyze-your-marketing/google-analytics",
  },
  unknown: {
    platform: "unknown",
    label: "your site",
    installSteps: [],
    guideUrl: GOOGLE_GENERIC_GUIDE,
  },
};

export function guideFor(platform: HostingPlatform): PlatformGuide {
  return GUIDES[platform];
}
