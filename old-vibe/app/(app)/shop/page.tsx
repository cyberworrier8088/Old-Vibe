import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { Banner } from "@/components/ui/Banner";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/auth/users";
import { balanceFor } from "@/lib/beans";
import { getDb } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { BEANS_PER_HOUR } from "@/lib/rewards";
import { PaperIcon } from "@/components/ui/PaperIcon";

import styles from "./page.module.css";

export const metadata: Metadata = { title: "Old Vibe Shop" };
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fshop");

  const [balance, rows] = await Promise.all([
    balanceFor(user.sub),
    getDb()
      .select()
      .from(items)
      .where(eq(items.hidden, false))
      .orderBy(asc(items.position), asc(items.name)),
  ]);

  return (
    <AppShell
      title="Old Vibe Shop"
      action={
        <div className={styles.balances}>
          <span className={styles.balance}>
            <PaperIcon size={18} />
            {" "}{balance.paper} paper
          </span>
          {balance.gold > 0 ? (
            <span className={styles.balance}>
              <PaperIcon size={18} variant="gold" />
              {" "}{balance.gold} gold paper
            </span>
          ) : null}
        </div>
      }
    >
      <Banner tone="info" title={`Every approved hour of real coding earns ${BEANS_PER_HOUR} paper`}>
        Spend your paper digital currency earned from coding in the Old Vibe shop to buy cool hacker valuable items.
      </Banner>

      {rows.length === 0 ? (
        <EmptyState title="Nothing in the shop right now">
          New gear and rewards are being stocked. Check back soon or visit the dashboard to log coding hours.
        </EmptyState>
      ) : (
        <div className={styles.grid}>
          {rows.map((item) => {
            const soldOut = item.stock !== null && item.stock <= 0;
            const itemBalance = item.currency === "gold" ? balance.gold : balance.paper;
            const short = item.cost - itemBalance;
            const affordable = short <= 0;

            return (
              <div
                key={item.id}
                className={[styles.card, affordable && !soldOut ? null : styles.short]
                  .filter(Boolean)
                  .join(" ")}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className={styles.thumb} />
                ) : (
                  <span className={styles.blank} aria-hidden="true">
                    📦
                  </span>
                )}
                <span className={styles.name}>{item.name}</span>
                {item.description ? (
                  <span className={styles.description}>{item.description}</span>
                ) : null}
                <span className={styles.price}>
                  <PaperIcon size={16} variant={item.currency === "gold" ? "gold" : "default"} />
                  {" "}{item.cost} {item.currency === "gold" ? "gold paper" : "paper"}
                  {item.stock !== null ? (
                    <span className={soldOut ? styles.gone : styles.stock}>
                      {soldOut ? "none left" : `${item.stock} left`}
                    </span>
                  ) : null}
                </span>
                {soldOut ? (
                  <ButtonLink href="/shop" variant="quiet" aria-disabled="true">
                    none left
                  </ButtonLink>
                ) : affordable ? (
                  <ButtonLink href={`/shop/${item.id}`} variant="quiet">
                    claim it
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/dash" variant="quiet" aria-disabled="true">
                    {short} {item.currency === "gold" ? "gold paper" : "paper"} short
                  </ButtonLink>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
