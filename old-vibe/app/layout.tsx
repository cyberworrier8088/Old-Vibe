import "./tokens.css";
import "./base.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { augie, readex } from "./fonts";

export const metadata: Metadata = {
  metadataBase: new URL("https://hackclub.com"),
  title: {
    default: "Old Vibe · Real Code, Real Rewards",
    template: "%s · Old Vibe",
  },
  description: "Ship a project coded by hand without AI. Earn digital currency to spend on real items in the Old Vibe shop.",
  icons: {
    icon: "https://assets.hackclub.com/icon-rounded.svg",
  },
  openGraph: {
    title: "Old Vibe · Real Code, Real Rewards",
    description: "Ship a project coded by hand without AI. Earn digital currency to spend on real items in the Old Vibe shop.",
    siteName: "Old Vibe",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf9f5",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${readex.variable} ${augie.variable}`}>
      <body>{children}</body>
    </html>
  );
}
