import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteNav } from "@/components/site/SiteNav";
import { Banner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { isOrganizer } from "@/lib/auth/organizer";
import { getCurrentUser } from "@/lib/auth/users";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Superviewer Login • Old Vibe",
  description: "Reviewer portal login for Slack members and organizers",
};

export default async function SuperLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();

  // If already logged in and verified Slack user, go directly to review dashboard
  if (user && isOrganizer(user)) {
    redirect("/dash/ships");
  }

  const isDenied = error === "denied";
  const isNonSlack = user && !isOrganizer(user);

  return (
    <div className={styles.ground}>
      <SiteNav />
      <div className={styles.center}>
        <div className={styles.card}>
          <div className={styles.badge}>
            <span>⚡</span>
            <span>Superviewer Console</span>
          </div>

          <h1 className={styles.title}>
            Reviewer <span className={styles.highlight}>Login</span>
          </h1>

          <p className={styles.body}>
            Superviewer is Old-Vibe&apos;s internal review desk. Slack users can evaluate project
            submissions, inspect code and live demos, and award Paper currency.
          </p>

          <div className={styles.slackNotice}>
            <span>🔒</span>
            <span>
              <strong>Slack Users Only:</strong> Access is restricted to Hack Club Slack members.
            </span>
          </div>

          {isNonSlack ? (
            <div className={styles.full}>
              <Banner tone="warn">
                Your current account ({user.email}) is not recognized as a Slack reviewer.
                Please sign in with your Slack-linked Hack Club account.
              </Banner>
            </div>
          ) : isDenied ? (
            <div className={styles.full}>
              <Banner tone="warn">Sign-in was cancelled. Please try again to access Superviewer.</Banner>
            </div>
          ) : null}

          <ButtonLink
            href="/api/auth/login?next=/dash/ships"
            className={styles.full}
          >
            {user ? "switch to Slack account" : "continue with Slack (Hack Club)"}
          </ButtonLink>

          <p className={styles.fine}>
            Authenticates via Hack Club Account to verify your Slack profile.
          </p>

          <Link href="/" className={styles.backLink}>
            ← Back to Old-Vibe
          </Link>
        </div>
      </div>
    </div>
  );
}
