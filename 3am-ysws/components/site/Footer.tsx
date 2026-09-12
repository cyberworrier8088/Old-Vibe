import { OldManFace } from "@/components/ui/OldManFace";

const LINKS = [
  { href: "https://hackclub.com", label: "Hack Club" },
  { href: "https://hackclub.slack.com", label: "Slack" },
  {
    href: "https://hackclub.com/privacy-and-terms#hack-club-standard-terms-and-conditions",
    label: "terms",
  },
  {
    href: "https://hackclub.com/privacy-and-terms#hack-club-privacy-notice",
    label: "privacy",
  },
];

import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brandRow}>
        <OldManFace size={22} />
        <span className={styles.motto}>OldVibe is made with ♥ by teenagers, for teenagers.</span>
      </div>
      <nav className={styles.links} aria-label="elsewhere">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
