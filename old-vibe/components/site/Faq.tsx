import type { ReactNode } from "react";

import { AccordionItem } from "@/components/ui/Accordion";

import styles from "./Faq.module.css";

type Entry = { question: string; answer: ReactNode };

const FAQ: Entry[] = [
  {
    question: "Why no vibe coding?",
    answer:
      "Old Vibe is about craft. When you write the code yourself you debug your own mistakes, understand every data structure and build intuition that lasts. Vibe coding hands that learning to a model, so it does not count here.",
  },
  {
    question: "What tools are allowed vs prohibited?",
    answer: (
      <>
        <strong>Allowed:</strong> any editor or IDE (including AI-enabled ones), documentation, MDN,
        textbooks, Stack Overflow, linters and formatters.
        <br />
        <br />
        <strong>Not allowed:</strong> code written by ChatGPT, Claude, v0, Bolt.new, agents or
        generators, accepted AI completions, vibe coding, and copy-pasting code you did not write.
      </>
    ),
  },
  {
    question: "Can I use Cursor, Copilot or another AI IDE?",
    answer:
      "You can open it, it is just an editor. You cannot let it write your project: chat, agent mode and accepted suggestions all count as AI-written code. If you are not sure, turn the AI features off while you work on your submission.",
  },
  {
    question: "Is copy-paste allowed?",
    answer:
      "Not for code you did not write. Reading docs and typing out what you learned is fine. Pasting a block from somewhere else is not, and large blocks that appear in one go are flagged during review.",
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
      "Reviewers read your commit history, your Hackatime activity (cadence, files, sudden large additions) and your README, and may ask you about a part of your code. Real work shows iteration, mistakes and fixes. Generated or pasted code looks different.",
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
