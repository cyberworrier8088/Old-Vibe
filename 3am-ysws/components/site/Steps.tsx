import type { ReactNode } from "react";

import styles from "./Steps.module.css";

type Step = {
  title: string;
  body: ReactNode;
  note: string;
};

const STEPS: Step[] = [
  {
    title: "Pick an idea you care about",
    body: "Build a web app, game, compiler, terminal utility, parser, or hardware system. Anything goes.",
    note: "Choose something you are genuinely curious about, where you want to understand every part.",
  },
  {
    title: "Write every line by hand (Zero AI)",
    body: "Turn off GitHub Copilot, Cursor AI autocompletions, and ChatGPT. Code with your own brain and fingers.",
    note: "Reading official documentation, MDN, textbooks, and man pages is 100% encouraged.",
  },
  {
    title: "Track your authentic hours",
    body: "Keep Hackatime enabled in your text editor while coding your project.",
    note: "Your tracked time is your proof of effort and determines the digital currency you earn.",
  },
  {
    title: "Ship and show your code",
    body: "Submit your GitHub repository and a live demo or video walkthrough.",
    note: "Human reviewers will inspect your commits and codebase to verify human craftsmanship.",
  },
  {
    title: "Earn digital currency & spend in Old Vibe shop",
    body: "Receive digital currency in your balance and spend it on real items in the Old Vibe shop.",
    note: "Redeem for microcontroller kits, books, tools, and developer hardware shipped directly to you.",
  },
];

export function Steps() {
  return (
    <ol className={styles.list}>
      {STEPS.map((step, index) => (
        <li key={step.title} className={styles.step}>
          <span className={styles.number} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h2 className={styles.title}>{step.title}</h2>
            <p className={styles.body}>{step.body}</p>
            <span className={styles.note}>{step.note}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
