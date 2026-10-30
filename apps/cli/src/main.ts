// Bots for local playtests that someone else plays: usually Claude in a Claude Code session,
// through the /playtest skill. Run as `pnpm -s brick <command>` from the repository root.
import { SHAPES_HELP, roomCodeSchema, type RoomSummary } from "@brick/game";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ActItem } from "./act";
import { Daemon } from "./daemon";
import { REACTION_HELP } from "./moves";
import { PERSONAS } from "./personas";

const ROOT = resolve(import.meta.dirname, "../../..");
const DIR = join(ROOT, ".local", "bots");
const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const DEFAULT_PORT = 7317;

const USAGE = `Usage: pnpm -s brick <command>
  start [CODE] [--bots N]   join room CODE with N bots (default 3); without CODE, the next lobby that opens.
                            Runs until stopped. Events go to stdout and .local/bots/events.log.
  next [SECONDS]            wait (default 90s) for the next events, then print them with the state when a bot
                            might act; prints [quiet] if nothing happened
  state                     what the room and each bot see, the new chat, and what each bot has to do
  act                       queue moves: a JSON array on stdin, e.g.
                              [{"bot":"Bea","action":{"type":"vote","answerId":"a2"}},
                               {"bot":"Cal","say":"no way that's mine","delay":4},
                               {"bot":"Dee","say":"called it","react":"lol","target":"Javi"},
                               {"bot":"Eli","draw":"circle 500 500 200; line 300 800 700 800"},
                               {"bot":"Fox","ready":true}]
                            One item can pair say and react with each other and with one move.
                            Player names work wherever an action wants a player id.
                            "delay" is in seconds; leave it out for a human-like pause.
  look BOT                  render the drawing BOT should look at (the revealed chain, or the fighters to bet on) to a PNG
  shapes                    the shapes "draw" understands
  personas                  who the bots are
  stop                      the bots leave and the daemon exits
Server: ${BASE} (set BASE_URL to change it).`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function daemonUrl(): string {
  const file = join(DIR, "daemon.json");
  if (!existsSync(file)) throw new Error("No bots are running. Start them with `pnpm -s brick start [CODE]`.");
  const { port } = JSON.parse(readFileSync(file, "utf8")) as { port: number };
  return `http://127.0.0.1:${port}`;
}

async function call(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${daemonUrl()}${path}`, init).catch(() => {
    throw new Error("The bot daemon isn't answering. Start it again with `pnpm -s brick start [CODE]`.");
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  return text;
}

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** The newest room in the lobby with someone in it, once one shows up in the open-rooms list. */
async function nextLobby(): Promise<string> {
  console.log(`Waiting for a room: create one at ${BASE} and the bots will join it.`);
  for (;;) {
    const rooms = (await fetch(`${BASE}/parties/lobby-registry/main`)
      .then((r) => r.json())
      .catch(() => [])) as RoomSummary[];
    const lobby = rooms.filter((r) => r.phase === "lobby").sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (lobby) return lobby.code;
    await sleep(1000);
  }
}

async function start(args: string[]) {
  const botsFlag = args.indexOf("--bots");
  const bots = botsFlag >= 0 ? Number(args[botsFlag + 1]) : 3;
  if (!Number.isInteger(bots) || bots < 1 || bots > PERSONAS.length) throw new Error(`--bots takes 1 to ${PERSONAS.length}.`);
  const codeArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--bots");
  const code = codeArg ? roomCodeSchema.parse(codeArg) : await nextLobby();
  const running = await call("/ping").catch(() => null);
  if (running) throw new Error(`Bots are already running (${running.replace("ok ", "room ")}). Stop them first: pnpm -s brick stop`);
  const port = Number(process.env.BRICK_PORT ?? DEFAULT_PORT);
  await new Daemon({ base: BASE, code, bots, port, dir: DIR }).start();
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
    case "start":
      return start(args);
    case "next":
      return console.log(await call(`/next?wait=${encodeURIComponent(args[0] ?? "")}`));
    case "state":
      return console.log(await call("/state"));
    case "act": {
      const input = args.length ? args.join(" ") : await readStdin();
      const items = JSON.parse(input) as ActItem | ActItem[];
      return console.log(await call("/act", { method: "POST", body: JSON.stringify(items) }));
    }
    case "look":
      if (!args[0]) throw new Error("Usage: pnpm -s brick look BOT");
      return console.log(await call(`/look?bot=${encodeURIComponent(args[0])}`));
    case "shapes":
      return console.log(SHAPES_HELP);
    case "personas":
      return console.log(PERSONAS.map((p) => `${p.name}: ${p.style}`).join("\n") + `\n${REACTION_HELP}`);
    case "stop":
      return console.log(await call("/stop", { method: "POST" }));
    default:
      return console.log(USAGE);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
