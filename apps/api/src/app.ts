import { Hono } from "hono";
import { logger } from "hono/logger";

export const app = new Hono()
  .use("*", logger())
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/api/hello", (c) => c.json({ message: "Barklog API is awake and ready to fetch." }));

/** Shared with the mobile app for end-to-end typed calls via Hono's RPC client. */
export type AppType = typeof app;
