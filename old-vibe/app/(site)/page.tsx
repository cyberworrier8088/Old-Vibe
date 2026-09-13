import { Section } from "@/components/site/Section";
import { Faq } from "@/components/site/Faq";
import { Steps } from "@/components/site/Steps";
import { ButtonLink } from "@/components/ui/Button";
import { PaperIcon } from "@/components/ui/PaperIcon";

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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <PaperIcon size={16} variant="default" /> Paper Currency Rewards
          </span>
        </div>

        <h1 className={styles.heading}>
          You ship handwritten code.
          <span className={styles.headingHighlight}>We grant Paper digital currency for the Old Vibe shop.</span>
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

          <div className={`${styles.dealCard} ${styles.dealCardPaper}`}>
            <div className={styles.dealHeader}>
              <span className={`${styles.dealTag} ${styles.dealTagReward}`}>
                <PaperIcon size={14} variant="gold" /> We Ship
              </span>
            </div>
            <h2 className={styles.dealTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Paper Currency <PaperIcon size={22} variant="default" />
            </h2>
            <p className={styles.dealBody}>
              For every authentic hour you spend coding, you earn Paper digital currency credited directly to your
              account. Spend your Paper in the Old Vibe shop to buy cool hacker items and hardware grants!
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

      <Section id="rules" label="the rules">
        <div className={styles.rulesContent}>
          <h2 className={styles.dealTitle}>Old Vibe Code Only</h2>
          <p className={styles.dealBody}>
            You can use AI for research and learning, but <strong>using AI to generate code or copy-pasting AI code is strictly prohibited.</strong>
            A 1% usage threshold is allowed, but anything more requires a detailed explanation or your project will be rejected. 
            If you want to build with AI, this is not the YSWS for you.
          </p>
          
          <h2 className={styles.dealTitle}>2+ Hours Minimum</h2>
          <p className={styles.dealBody}>
            You must have at least 2 hours of tracked time in Hackatime for your project to be eligible for submission. We value genuine effort.
          </p>

          <h2 className={styles.dealTitle}>Submission Cut-off</h2>
          <p className={styles.dealBody}>
            The deadline for all submissions is <strong>September 11, 2026</strong>. Hackatime hours and projects logged after this date will not be accepted.
          </p>
        </div>
      </Section>

      <Section id="faq" label="questions">
        <Faq />
      </Section>
    </>
  );
}
