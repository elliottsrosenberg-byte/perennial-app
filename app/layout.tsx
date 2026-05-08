import type { Metadata } from "next";
import { Newsreader, Albert_Sans } from "next/font/google";
import "./globals.css";

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
      </head>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
