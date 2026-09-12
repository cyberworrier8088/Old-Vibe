import { Section } from "@/components/site/Section";
import { Faq } from "@/components/site/Faq";
import { Steps } from "@/components/site/Steps";
import { ButtonLink } from "@/components/ui/Button";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.kicker}>
          <span>Old Vibe</span>
          <span>•</span>
          <span>No AI</span>
          <span>•</span>
          <span>Digital Currency Rewards</span>
        </div>

        <h1 className={styles.heading}>
          You ship handwritten code.
          <span className={styles.headingHighlight}>We grant digital currency for the Old Vibe shop.</span>
        </h1>

        <p className={styles.lead}>
          No vibe coding. No prompt engineering. No AI autocomplete. Just you, your editor, and
          software you actually understand from top to bottom.
        </p>

        <div className={styles.dealGrid}>
          <div className={styles.dealCard}>
            <div className={styles.dealHeader}>
              <span className={`${styles.dealTag} ${styles.dealTagShip}`}>You Ship</span>
            </div>
            <h2 className={styles.dealTitle}>Handmade Software</h2>
            <p className={styles.dealBody}>
              Build a website, CLI, game, tool, or hardware project completely by hand. Every line of code
              must be written by a human. No LLM wrappers or copy-paste AI scaffolds.
            </p>
          </div>

          <div className={styles.dealCard}>
            <div className={styles.dealHeader}>
              <span className={`${styles.dealTag} ${styles.dealTagReward}`}>We Ship</span>
            </div>
            <h2 className={styles.dealTitle}>Digital Currency</h2>
            <p className={styles.dealBody}>
              For every authentic hour you spend coding, you earn digital currency credited directly to your
              account. Spend it in the Old Vibe shop to buy cool hacker valuable items.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <ButtonLink href="/login">Start Building</ButtonLink>
          <ButtonLink href="/shop" variant="ghost">
            Explore Old Vibe Shop
          </ButtonLink>
          <ButtonLink href="/#how-it-works" variant="quiet">
            How it works
          </ButtonLink>
        </div>

        <p className={styles.footerNote}>
          Tracked with Hackatime • Reviewed by humans • Free for teen makers worldwide
        </p>
      </section>

      <Section id="how-it-works" label="how it works">
        <Steps />
      </Section>

      <Section id="faq" label="questions & rules">
        <Faq />
      </Section>
    </>
  );
}
