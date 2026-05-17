// Per-provider brand icons. Sourced from Simple Icons (CC0) via the
// react-icons/si subset — tree-shakeable so each icon is ~1kb gzipped
// and only the ones we use ship in the bundle.
//
// Two providers get full-color custom SVGs because their official
// brand expression is multi-color and looks wrong in monochrome:
//   - Google (the multi-color "G")
//   - Microsoft (the 4-square logo)
//
// Everything else uses the official Simple Icons monochrome glyph in
// the brand color.

import React from "react";
import {
  SiInstagram,
  SiMailchimp,
  SiSubstack,
  SiTiktok,
  SiStripe,
  SiPlausibleanalytics,
  SiMeta,
  SiApple,
  SiGoogleanalytics,
  SiGooglecalendar,
} from "react-icons/si";

// Brand colors (official where published, Simple Icons hex otherwise).
const BRAND_COLOR: Record<string, string> = {
  instagram:        "#E4405F",
  mailchimp:        "#FFE01B",
  beehiiv:          "#FFD600",
  substack:         "#FF6719",
  tiktok:           "#000000",
  stripe:           "#635BFF",
  plausible:        "#5850EC",
  meta:             "#0866FF",
  apple_icloud:     "#000000",
  google_analytics: "#E37400",
  google_calendar:  "#4285F4",
};

export interface ProviderIconProps {
  /** Must match the provider slug used in the integrations table. */
  provider: string;
  /** Pixel size of the rendered SVG. Defaults to 20. */
  size?:   number;
  /** Color override. Defaults to the brand color from BRAND_COLOR,
   *  falling back to currentColor. */
  color?:  string;
}

export default function ProviderIcon({ provider, size = 20, color }: ProviderIconProps) {
  const fill = color ?? BRAND_COLOR[provider] ?? "currentColor";

  // ── Custom multi-color marks ──────────────────────────────────────
  if (provider === "google") {
    // Official Google "G" — multi-color. The four color paths form the
    // outer arc + the inner horizontal bar.
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden role="img">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
      </svg>
    );
  }

  if (provider === "microsoft") {
    // Official Microsoft 4-square logo.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img">
        <rect x="1"    y="1"    width="10" height="10" fill="#F25022"/>
        <rect x="13"   y="1"    width="10" height="10" fill="#7FBA00"/>
        <rect x="1"    y="13"   width="10" height="10" fill="#00A4EF"/>
        <rect x="13"   y="13"   width="10" height="10" fill="#FFB900"/>
      </svg>
    );
  }

  // ── Simple Icons (monochrome) ─────────────────────────────────────
  const props = { size, color: fill, "aria-hidden": true, role: "img" as const };
  switch (provider) {
    case "instagram":         return <SiInstagram         {...props} />;
    case "mailchimp":         return <SiMailchimp         {...props} />;
    case "beehiiv":           return <BeehiivIcon         size={size} color={fill} />;
    case "substack":          return <SiSubstack          {...props} />;
    case "tiktok":            return <SiTiktok            {...props} />;
    case "stripe":            return <SiStripe            {...props} />;
    case "plausible":         return <SiPlausibleanalytics {...props} />;
    case "meta":
    case "facebook":          return <SiMeta              {...props} />;
    case "apple_icloud":      return <SiApple             {...props} />;
    case "google_analytics":  return <SiGoogleanalytics   {...props} />;
    case "google_calendar":   return <SiGooglecalendar    {...props} />;

    case "teller":
    case "bank":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2563ab" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden role="img">
          <path d="M2 8l10-5 10 5"/>
          <path d="M3 8h18v2H3z"/>
          <path d="M5 10v8M9 10v8M15 10v8M19 10v8"/>
          <path d="M3 21h18"/>
        </svg>
      );

    default:
      // Generic link glyph for unknown providers — prevents crashes
      // if a new provider slug is added to the DB before this file.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={fill} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden role="img">
          <path d="M10 14a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07L11 6"/>
          <path d="M14 10a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07L13 18"/>
        </svg>
      );
  }
}

/** Beehiiv isn't in react-icons yet — official mark inlined from
 *  their press kit (the rounded-square "B" wordmark, simplified). */
function BeehiivIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden role="img">
      <path d="M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5zm3.5 4h5a3.5 3.5 0 012.4 6.05A3.75 3.75 0 0114 19.5H8.5a.75.75 0 01-.75-.75v-11A.75.75 0 018.5 7zm.75 1.5v3.25h4.25a1.625 1.625 0 100-3.25H9.25zm0 4.75v4.5H14a2.25 2.25 0 100-4.5H9.25z"/>
    </svg>
  );
}
