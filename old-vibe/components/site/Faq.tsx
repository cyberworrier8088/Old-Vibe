import type { ReactNode } from "react";

import { AccordionItem } from "@/components/ui/Accordion";

import styles from "./Faq.module.css";

type Entry = { question: string; answer: ReactNode };

const FAQ: Entry[] = [
  {
    question: "Why strictly no AI or vibe-coding?",
    answer:
      "Vibe coding might be trendy, but Old Vibe is about true craftsmanship. When you code without AI, you genuinely learn how software works: you debug your own mistakes, understand every data structure, and build lasting intuition. We want to celebrate the real craft of programming.",
  },
  {
    question: "What tools are allowed vs prohibited?",
    answer: (
      <>
        <strong>Allowed:</strong> Language documentation, MDN, textbooks, StackOverflow answers, standard syntax highlighting, and linters.
        <br />
        <br />
        <strong>Prohibited:</strong> GitHub Copilot, Cursor AI autocompletions, ChatGPT, Claude, v0, Bolt.new, and any AI code generation or boilerplate synthesis.
      </>
    ),
  },
  {
    question: "What is the digital currency and how does the Old Vibe shop work?",
    answer:
      "For every verified hour of hand-crafted coding tracked via Hackatime, you earn digital currency in your Old Vibe account. You can spend that balance in the Old Vibe shop to order real items—like electronics kits, developer hardware, programming books, and tools—shipped to your door for free.",
  },
  {
    question: "What kind of project can I build?",
    answer:
      "Almost anything! A website, desktop utility, command-line tool, game engine, retro game, or hardware firmware. The only requirement is that you write and understand every line of code.",
  },
  {
    question: "How do reviewers know if AI was used?",
    answer:
      "Our reviewers examine your git commit history, coding cadence on Hackatime, and code architecture. Natural human coding has iterative commits, edits, and distinct problem-solving styles that look completely different from LLM outputs. You will also submit a brief demo explaining your code.",
  },
  {
    question: "Who is eligible to participate?",
    answer:
      "Teenagers aged 13 to 18 worldwide. Old Vibe and Hack Club programs are always 100% free.",
  },
];

export function Faq() {
  return (
    <div className={styles.list}>
      {FAQ.map((entry) => (
        <AccordionItem key={entry.question} question={entry.question}>
          {entry.answer}
        </AccordionItem>
      ))}
    </div>
  );
}
