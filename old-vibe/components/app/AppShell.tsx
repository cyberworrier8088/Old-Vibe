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
          <a href="https://hackclub.com/" className={styles.flagLink}>
            {/* Small SVG served from the Hack Club CDN, so next/image has nothing to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.flag}
              src="https://assets.hackclub.com/flag-orpheus-top.svg"
              alt="Hack Club"
              width={128}
              height={72}
            />
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
      <a href="https://hackclub.com/" target="_blank" rel="noreferrer" className={styles.madeBy}>
        OldVibe is made with ♥ by teenagers, for teenagers.
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://assets.hackclub.com/icon-progress-rounded.svg"
          alt="Hack Club"
          width={24}
          height={24}
          className={styles.madeByIcon}
        />
      </a>
      <div className={styles.bar}>
        <NavLinks variant="bar" items={nav} />
      </div>
    </>
  );
}
