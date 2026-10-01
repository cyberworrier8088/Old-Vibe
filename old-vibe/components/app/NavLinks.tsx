"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isActive } from "@/lib/nav";
import type { NavItem } from "@/lib/nav";

import styles from "./NavLinks.module.css";

export function NavLinks({ variant, items }: { variant: "side" | "bar"; items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const navRef = useRef<HTMLElement>(null);

  // Reviewers get more links than fit across a phone, so the bar scrolls the current one into view.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (variant !== "bar" || !nav || !current) return;
    const navBox = nav.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    nav.scrollLeft += box.left - navBox.left - (navBox.width - box.width) / 2;
  }, [pathname, variant]);

  return (
    <nav
      ref={navRef}
      className={styles[variant]}
      aria-label={variant === "side" ? "sections" : undefined}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? styles.on : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.mark} aria-hidden="true">
              {active ? "◆" : "◇"}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
