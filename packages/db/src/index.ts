import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/client";

export * from "./ai-spend";
export * from "./cards";
export * from "./cleanup";
export * from "./keys";
export * from "./matches";
export * from "./players";
export * from "./rooms";

export type Db = PrismaClient;

/**
 * A Prisma client over a D1 binding. Create one per Durable Object or request; there is no
 * process-wide singleton in Workers.
 */
export function createDb(d1: D1Database): Db {
  return new PrismaClient({ adapter: new PrismaD1(d1) });
}
