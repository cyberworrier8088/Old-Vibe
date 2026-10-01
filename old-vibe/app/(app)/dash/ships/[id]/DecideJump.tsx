"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";

type Where = "below" | "visible" | "above";

/**
 * On a phone the decision form comes after all the evidence. This link jumps down to it, and once
 * the form is on screen it jumps back up to the evidence.
 */
export function DecideJump({ label, className }: { label: string; className?: string }) {
  const [where, setWhere] = useState<Where>("below");

  useEffect(() => {
    const form = document.getElementById("decision");
    if (!form) return;
    // The form counts as on screen once it reaches the top 60% of the viewport.
    const observer = new IntersectionObserver(
      ([entry]) =>
        setWhere(entry.isIntersecting ? "visible" : entry.boundingClientRect.top > 0 ? "below" : "above"),
      { rootMargin: "0px 0px -40% 0px" },
    );
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  const target = where === "visible" ? "evidence" : "decision";

  function jump(event: MouseEvent<HTMLAnchorElement>) {
    const element = document.getElementById(target);
    if (!element) return;
    event.preventDefault();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }

  return (
    <a href={`#${target}`} className={className} onClick={jump}>
      {where === "visible" ? "↑ Evidence" : `${label} ${where === "above" ? "↑" : "↓"}`}
    </a>
  );
}
