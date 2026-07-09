import { createMiddleware } from "hono/factory";
import { verifyJwt } from "./auth";
import type { Env } from "./types";

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = header.slice(7);
  try {
    const payload = await verifyJwt(c.env, token);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

export const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");
  if (!user || (!user.is_admin && user.email !== c.env.ADMIN_EMAIL)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
