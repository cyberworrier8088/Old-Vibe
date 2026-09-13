import type { ReactNode } from "react";

import { SiteNav } from "@/components/site/SiteNav";

import styles from "./Notice.module.css";

export function Notice({
  title,
  children,
  actions,
  reference,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  reference?: string;
}) {
  return (
    <div className={styles.ground}>
      <SiteNav />
      <div className={styles.center}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.body}>{children}</p>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
          {reference ? <p className={styles.ref}>{reference}</p> : null}
        </div>
      </div>
    </div>
  );
}
