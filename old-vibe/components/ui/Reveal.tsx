"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./Reveal.module.css";

/**
 * A section that fades up the first time it scrolls into view. It is visible by default and only
 * hidden once the page has hydrated and the section is below the fold, so a failed script never
 * leaves content invisible.
 */
export function Reveal({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || node.getBoundingClientRect().top < window.innerHeight) return;

    node.dataset.pending = "";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          delete node.dataset.pending;
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section id={id} ref={ref} className={[styles.reveal, className].filter(Boolean).join(" ")}>
      {children}
    </section>
  );
}
