import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { OldManFace } from "@/components/ui/OldManFace";
import { SITE_NAV } from "@/lib/nav";

import styles from "./SiteNav.module.css";

export function SiteNav() {
  return (
    <header>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <OldManFace size={30} />
          <span className={styles.wordmark}>Old Vibe</span>
        </Link>
        <span className={styles.links}>
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <ButtonLink href="/shop" variant="quiet">
            shop
          </ButtonLink>
          <ButtonLink href="/login" variant="primary">
            start building
          </ButtonLink>
        </span>
      </nav>
    </header>
  );
}
