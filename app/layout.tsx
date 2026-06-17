import type { Metadata } from "next";
import { Newsreader, Albert_Sans } from "next/font/google";
import "./globals.css";
import PostHogProvider from "@/components/analytics/PostHogProvider";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Perennial",
  description: "Tools for independent designers.",
  icons: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${albertSans.variable} h-full`}>
      <head>
        <link rel="icon" href="/FavDark.svg" type="image/svg+xml" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/FavLight.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)" />
        {/* Paint the resolved theme before first render to avoid a flash —
            honors auto mode (dark at night). Mirrors lib/theme.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a=localStorage.getItem('perennial-theme-auto')==='1';var b=localStorage.getItem('perennial-theme')==='dark'?'dark':'light';var h=new Date().getHours();var t=a?((h>=19||h<7)?'dark':'light'):b;document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-full antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
