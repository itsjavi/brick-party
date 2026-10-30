/**
 * Every hand-written pack item carries one topic and one style, so the balance of a pack can be
 * measured (`pnpm --filter @brick/content balance`) and steered. Pick what the joke targets, not
 * where it happens to be set.
 */
export const TOPICS = {
  office: "Office and remote-work life: meetings, calls, coworkers, managers, chat, the kitchen.",
  startup: "Startup and SaaS business: pricing, sales, investors, churn, growth, pivots.",
  surveys: "Surveys, feedback and forms in general.",
  formbricks: "Formbricks itself: its features, its quirks, open source and self-hosting.",
  ai: "AI from brilliant to catastrophic: assistants, agents, job takeover, robot overlords.",
  engineering: "Software engineering: code, bugs, deploys, git, CI, legacy code.",
  product: "Product management: roadmaps, feature requests, MVPs, launches, metrics.",
  ux: "UX and UI design: flows, buttons, dark patterns, onboarding, design systems.",
  accessibility: "Accessibility: contrast, screen readers, alt text, keyboard traps. Roast products, never people.",
  life: "Everyday life outside work: food, home, travel, family, hobbies.",
  surreal: "Nothing real is targeted: creatures, objects and cosmic things living absurd lives.",
} as const;

export const STYLES = {
  observational: "A relatable truth: recognizable everyday behavior.",
  satire: "A sharp roast of a practice, an industry, a company or a role.",
  absurd: "Silly nonsense: an odd creature or object in the wrong place.",
  unhinged: "Extreme absurdity told deadpan: surreal logic, sentient concepts, cosmic stakes, escalation.",
  dark: "Doom played for laughs: apocalypse, robot overlords, existential dread, cartoon peril.",
  anti: "Anti-humor: so obvious or boring that it's funny.",
  wordplay: "Puns, rhymes and double meanings.",
} as const;

export type Topic = keyof typeof TOPICS;
export type Style = keyof typeof STYLES;
export const TOPIC_IDS = Object.keys(TOPICS) as Topic[];
export const STYLE_IDS = Object.keys(STYLES) as Style[];
