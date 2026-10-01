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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
  colorScheme: "light dark",
};

// Runs before first paint: the saved choice, else the system setting.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${readex.variable} ${augie.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
