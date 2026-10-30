import { createRng, type MiwAnswer, type MiwQuestion } from "@brick/game";

/** A sticky-note answer in words: the option, "4 out of 5", "37 cups", "Yes please". */
export function noteText(q: MiwQuestion | undefined, a: MiwAnswer): string {
  if (!q || a === null) return "?";
  switch (q.kind) {
    case "choice":
      return q.options[a as number] ?? "?";
    case "rating":
      return `${a} out of 5`;
    case "number":
      return `${a} ${q.unit}`;
    case "consent":
      return a ? "Yes please" : "No thanks";
  }
}

/** A steady random sequence for a form, so its maze and popups look the same each time it's drawn. */
export function formRandom(key: string): () => number {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return createRng(h >>> 0).next;
}

export const MODAL_LINES = [
  {
    title: "Before you start!",
    body: "Would you like to hear about our cookies? Not those cookies. The tracking ones.",
  },
  { title: "Are you sure?", body: "You closed our popup. We noticed. Here is a popup about that." },
  { title: "Wait, one more thing", body: "Rate this popup on a scale of 1 to 10 popups." },
  { title: "We miss you already", body: "It's been 0.4 seconds since our last popup. Here's a fresh one." },
  { title: "Notifications?", body: "Allow notifications so we can tell you about more popups." },
  { title: "Special offer", body: "Close this popup within 3 seconds to win another popup." },
  { title: "Newsletter!", body: "Subscribe to Popup Weekly, the newsletter that is also a popup." },
];

export const CAPTCHA_FAILS = [
  "Wrong. One of those was quietly sad.",
  "Wrong. Are you a robot? Be honest.",
  "Wrong. The triangle was feeling nostalgic.",
  "Wrong. Please try again, slowly, like a human.",
  "Wrong again. Have you considered having feelings?",
];

const CLAUSES = [
  "By reading this clause you agree that you have read this clause.",
  "The Survey may be updated at any time, for any reason, including no reason.",
  "You grant the Survey a worldwide, royalty-free licence to your favourite colour.",
  "Answers given before coffee are not legally binding.",
  "The Company is not liable for feelings caused by rating scales.",
  "Any resemblance between this form and a good form is purely coincidental.",
  "You agree to be contacted by email, phone, carrier pigeon and interpretive dance.",
  "Section 7 has been removed for being too reasonable.",
  "Scrolling past this clause counts as a signature, a handshake and a pinky promise.",
  "The Company reserves the right to reserve further rights at a later date.",
  "These terms are governed by the laws of whichever place is most inconvenient for you.",
  "If any clause is found unenforceable, the remaining clauses will be very upset about it.",
  "You consent to receiving surveys about this survey.",
  "Your data is safe with us, for a broad definition of safe and a narrow definition of us.",
];

/** The terms box: long, numbered and of no use to anyone. */
export const TERMS: string[] = Array.from(
  { length: 42 },
  (_, i) => `${Math.floor(i / 6) + 1}.${(i % 6) + 1} ${CLAUSES[(i * 5) % CLAUSES.length]}`,
);
