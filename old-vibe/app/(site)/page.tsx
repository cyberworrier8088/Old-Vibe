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
          <span>Hand-written</span>
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
          Use any editor you like, even an AI-enabled IDE. But no vibe coding, no AI-written code and no copy-paste: every line is yours, and you can explain all of it.
        </p>

        <div className={styles.dealGrid}>
          <div className={styles.dealCard}>
            <div className={styles.dealHeader}>
              <span className={`${styles.dealTag} ${styles.dealTagShip}`}>You Ship</span>
            </div>
            <h2 className={styles.dealTitle}>Handmade Software</h2>
            <p className={styles.dealBody}>
              Build a website, CLI, game, tool, or hardware project completely by hand. Every line must be written by you. No vibe coding, no code from a chat or an agent, and no pasted code you did not write.
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
          <h2 className={styles.dealTitle}>Your Code, Your Hands</h2>
          <p className={styles.dealBody}>
            An AI-enabled IDE is fine, it is just an editor. What counts is who wrote the code.
            Every line has to come from you, and you have to be able to explain it. A 1% slip is
            tolerated; anything more needs a written explanation or the project is rejected.
          </p>

          <div className={styles.ruleCols}>
            <div className={`${styles.ruleCard} ${styles.ruleYes}`}>
              <span className={styles.ruleHead}>Allowed</span>
              <ul>
                <li>Any editor or IDE, including ones with AI built in</li>
                <li>Docs, tutorials, Stack Overflow, and asking a person for help</li>
                <li>Libraries and frameworks, credited in your README</li>
                <li>Adapting a short example from the docs, once you understand it</li>
              </ul>
            </div>
            <div className={`${styles.ruleCard} ${styles.ruleNo}`}>
              <span className={styles.ruleHead}>Not allowed</span>
              <ul>
                <li>Vibe coding, or agents and chats writing your project</li>
                <li>Accepting AI-generated code, completions included</li>
                <li>Copy-pasting code you did not write and cannot explain</li>
                <li>Faking time: bots, fake keystrokes, idle editors</li>
              </ul>
            </div>
          </div>

          <h2 className={styles.dealTitle}>Show Your Work</h2>
          <p className={styles.dealBody}>
            Real projects grow in steps. Reviewers read your commit history, your Hackatime
            activity and your README, and may ask you to explain a part of the code. Large blocks
            that appear all at once, or a project with one commit, will be looked at closely.
          </p>
          
          <h2 className={styles.dealTitle}>What Reviewers Look For</h2>
          <ul className={styles.checkList}>
            <li>A public repository with a README that says what the project is and how to run it.</li>
            <li>A demo people can open or download. A video of it does not count.</li>
            <li>Time that matches the work. Forty hours cannot be a few dozen lines.</li>
            <li>Work that is new. A repository can only be submitted once, and the same hours cannot be claimed twice.</li>
            <li>Honest Hackatime data. No bots, fake keystrokes or editors left running.</li>
          </ul>

          <h2 className={styles.dealTitle}>When The Rules Are Broken</h2>
          <p className={styles.dealBody}>
            Reviews are done by people, and a violation is a decision a person made and wrote
            down. You are told the reason. Repeated violations escalate.
          </p>
          <ol className={styles.ladder}>
            <li className={styles.ladderStep}>
              <span className={styles.ladderNum}>First</span>
              <span className={styles.ladderWhat}>7 day ban</span>
            </li>
            <li className={styles.ladderStep}>
              <span className={styles.ladderNum}>Second</span>
              <span className={styles.ladderWhat}>30 day ban</span>
            </li>
            <li className={`${styles.ladderStep} ${styles.ladderFinal}`}>
              <span className={styles.ladderNum}>Third</span>
              <span className={styles.ladderWhat}>Permanent</span>
            </li>
          </ol>
          <p className={styles.dealBody}>
            Fraud skips the ladder: fake time, bots, stolen work or lying about what you built is
            a permanent ban straight away. While banned you cannot submit projects or place
            orders, but you can still sign in and read why. If you think it was a mistake, message
            the organizers on Hack Club Slack and a reviewer will look again. Hack Club also bans
            Hackatime accounts that fake their time.
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
