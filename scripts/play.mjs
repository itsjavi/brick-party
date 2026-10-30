// Starts a local game in one go: the dev server, a new room in your browser, and bots that join
// it once you're in.
// Usage: pnpm play [count]   (3 bots by default)
import { spawn } from "node:child_process";
import { join } from "node:path";
import { addBots } from "./lib/bots.mjs";

const count = Number(process.argv[2] ?? 3);
if (!Number.isInteger(count) || count < 1 || count > 11) {
  console.error("Usage: pnpm play [count]   (1 to 11 bots; 12 players is the most that play)");
  process.exit(1);
}
const base = process.env.BASE_URL ?? "http://localhost:5173";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Any code works as a room; picking it here means the script knows which room is yours. Same
// letters as ROOM_CODE_ALPHABET in packages/game/src/protocol.ts.
const letters = "BCDFGHJKLMNPQRSTVWXZ";
const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");

let dev = null;
let bots = null;
let stopping = false;

async function stop() {
  stopping = true;
  const devStopped = dev?.exitCode === null && new Promise((resolve) => dev.once("exit", resolve));
  // pnpm stops the dev server on SIGINT, like Ctrl+C in a terminal. It ignores SIGTERM.
  dev?.kill("SIGINT");
  await bots?.close();
  if (devStopped) await Promise.race([devStopped, sleep(10_000)]);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const serverUp = () =>
  fetch(base)
    .then(() => true)
    .catch(() => false);

if (!(await serverUp())) {
  console.log("Starting the dev server...");
  // No stdin, so vite doesn't read keyboard shortcuts from the terminal. Its own process group,
  // so Ctrl+C reaches it once, through `stop`.
  dev = spawn("pnpm", ["--dir", "apps/web", "dev"], {
    cwd: join(import.meta.dirname, ".."),
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  dev.on("exit", (code) => {
    if (stopping) return;
    console.error(`The dev server stopped (exit code ${code}).`);
    process.exit(1);
  });
  const deadline = Date.now() + 240_000;
  while (!(await serverUp())) {
    if (Date.now() > deadline) {
      console.error(`The dev server didn't answer at ${base} within 4 minutes.`);
      await stop();
    }
    await sleep(500);
  }
}

/**
 * Waits until someone is online in room `code`, using the open-rooms list the home page shows.
 * That's you, since only you have the link, so you're the host by the time the bots arrive.
 */
function someoneIn(code) {
  return new Promise((resolve) => {
    const watch = () => {
      const ws = new WebSocket(`${base.replace(/^http/, "ws")}/parties/lobby-registry/main`);
      ws.onmessage = (event) => {
        if (!JSON.parse(event.data).rooms?.some((room) => room.code === code)) return;
        ws.onclose = null;
        ws.close();
        resolve();
      };
      // Dev server reloads drop the socket; pick the list up again.
      ws.onclose = () => setTimeout(watch, 1000);
    };
    watch();
  });
}

const url = `${base}/r/${code}`;
console.log(`Opening room ${code} (${url}). ${count} bot${count === 1 ? "" : "s"} will join once you're in.`);
spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
  stdio: "ignore",
  detached: true,
}).unref();

await someoneIn(code);
bots = await addBots(base, code, count);
console.log("Bots are idle; the game plays their turns when timers run out. Ctrl+C to stop.");
await new Promise(() => {});
