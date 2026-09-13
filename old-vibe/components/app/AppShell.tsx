import Link from "next/link";
import type { ReactNode } from "react";

import { isOrganizer } from "@/lib/auth/organizer";
import { getCurrentUser } from "@/lib/auth/users";
import { APP_NAV, ORGANIZER_NAV } from "@/lib/nav";
import type { NavItem } from "@/lib/nav";
import { OldManFace } from "@/components/ui/OldManFace";

import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.css";

export async function AppShell({
  title,
  action,
  aside,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const nav: NavItem[] = isOrganizer(user) ? [...APP_NAV, ...ORGANIZER_NAV] : APP_NAV;

  return (
    <>
      <div className={styles.shell}>
        <aside className={styles.side}>
          <a href="https://hackclub.com/">
            <img style={{ position: "absolute", top: 0, left: 10, border: 0, width: 128, zIndex: 999 }} src="https://assets.hackclub.com/flag-orpheus-top.svg" alt="Hack Club" />
          </a>
          <Link href="/dash" className={styles.brand}>
            <OldManFace size={26} />
            <span className={styles.wordmark}>Old Vibe</span>
          </Link>
          <NavLinks variant="side" items={nav} />
          {aside ? <div className={styles.sideFoot}>{aside}</div> : null}
        </aside>
        <main className={styles.main}>
          <div className={styles.top}>
            <h1 className={styles.title}>{title}</h1>
            {action}
          </div>
          {children}
        </main>
      </div>
      <div className={styles.bar}>
        <NavLinks variant="bar" items={nav} />
      </div>
      <a href="https://hackclub.com/" target="_blank" rel="noreferrer" className={styles.madeBy}>
        OldVibe is made with ♥ by teenagers, for teenagers.
        <img src="https://assets.hackclub.com/icon-progress-rounded.svg" alt="Hack Club" className={styles.madeByIcon} />
      </a>
    </>
  );
}
