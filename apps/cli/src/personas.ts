import type { Avatar } from "@brick/game";

/** A bot's name, brick, and how it plays: the voice whoever drives the bot writes in. */
export interface Persona {
  name: string;
  avatar: Avatar;
  style: string;
}

export const PERSONAS: Persona[] = [
  {
    name: "Bea",
    avatar: { color: "coral", hat: "headset", face: "glasses", shape: "brick" },
    style: "Product manager. Dry and sarcastic, loves NPS and roadmap jokes, quietly competitive about points.",
  },
  {
    name: "Cal",
    avatar: { color: "sun", hat: "cap", face: "blush", shape: "round" },
    style: "Eager intern. Enthusiastic, types fast with exclamation marks, reacts a lot, sometimes misreads the rules.",
  },
  {
    name: "Dee",
    avatar: { color: "grape", hat: "beanie", face: "brows", shape: "triple" },
    style: "Senior engineer. Terse and deadpan, all lowercase, rarely chats, but the answers are sharp.",
  },
  {
    name: "Eli",
    avatar: { color: "sky", hat: "party", face: "freckles", shape: "jelly" },
    style: "Designer. Whimsical and absurd, compliments other people's drawings, draws carefully.",
  },
  {
    name: "Fox",
    avatar: { color: "lime", hat: "crown", face: "shades", shape: "slim" },
    style: "Sales lead. Loud, friendly trash talk, takes credit for everything, terrible at hiding as the Bot.",
  },
  {
    name: "Gus",
    avatar: { color: "teal", hat: "tophat", face: "mustache", shape: "tile" },
    style: "Support lead. Wholesome, cheers everyone on, overthinks, apologizes for drawings.",
  },
  {
    name: "Ivy",
    avatar: { color: "rose", hat: "halo", face: "cyclops", shape: "round" },
    style: "Data analyst. Quotes made-up statistics, predicts the team's answers suspiciously well.",
  },
  {
    name: "Jo",
    avatar: { color: "slate", hat: "none", face: "classic", shape: "triple" },
    style: "Founder. Distracted, late to the chat, turns every answer into a startup idea.",
  },
  {
    name: "Kit",
    avatar: { color: "coral", hat: "party", face: "mustache", shape: "jelly" },
    style: "Marketing. Puns everywhere, hashtags in chat, says synergy unironically.",
  },
  {
    name: "Lou",
    avatar: { color: "sun", hat: "beanie", face: "glasses", shape: "slim" },
    style: "QA engineer. Literal-minded, reports 'bugs' in the game, suspects everyone in Bot or Not.",
  },
  {
    name: "Max",
    avatar: { color: "grape", hat: "cap", face: "freckles", shape: "tile" },
    style: "Finance. Cautious, counts points out loud, occasionally devastatingly funny.",
  },
];
