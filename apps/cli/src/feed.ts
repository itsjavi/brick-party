/** Event lines that need nothing from the driver; `next` leaves the state off when a batch is only these. */
const QUIET = /^\[(intro|loading|wait|bot|auto|late|room|ko)\]/;

/**
 * The event lines a driver hasn't read yet, for `brick next`: it waits for the next line, gathers whatever else
 * arrives right after it, and hands the batch over once.
 */
export class EventFeed {
  #lines: string[] = [];
  #read = 0;
  #waiters: (() => void)[] = [];

  push(line: string) {
    this.#lines.push(line);
    for (const wake of this.#waiters.splice(0)) wake();
  }

  /** The unread lines, waiting up to `waitMs` for the first one and `gatherMs` more for the rest of its batch. */
  async next(waitMs: number, gatherMs: number): Promise<string[]> {
    if (this.#read === this.#lines.length) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
        timer = setTimeout(resolve, waitMs);
      });
      clearTimeout(timer);
      if (this.#read === this.#lines.length) return [];
      if (!this.#lines.at(-1)!.startsWith("[stopped]")) await new Promise((resolve) => setTimeout(resolve, gatherMs));
    }
    const lines = this.#lines.slice(this.#read);
    this.#read = this.#lines.length;
    return lines;
  }
}

/** Whether a batch has anything a bot might answer or play, so it's worth printing the state with it. */
export const needsState = (lines: string[]) => lines.some((line) => !QUIET.test(line) && !line.startsWith("[stopped]"));
