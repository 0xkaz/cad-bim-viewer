import { Hono } from "hono";
import { logAction } from "./audit";
import {
  listAllConversions,
  listAllFiles,
  listAllUsers,
  listAuditLogs,
  listConversionQuotas,
} from "./db";
import { adminMiddleware, authMiddleware } from "./middleware";
import type { Env } from "./types";

const adminApp = new Hono<Env>();

adminApp.use("*", authMiddleware, adminMiddleware);

adminApp.get("/files", async (c) => {
  const user = c.get("user");
  const files = await listAllFiles(c.env.DB);
  await logAction(c.env.DB, { id: user.sub, email: user.email }, "admin_view", "file", "all");
  return c.json({ files });
});

adminApp.get("/users", async (c) => {
  const users = await listAllUsers(c.env.DB);
  return c.json({ users });
});

adminApp.get("/audit", async (c) => {
  const user = c.get("user");
  const limit = Number(c.req.query("limit") ?? "1000");
  const offset = Number(c.req.query("offset") ?? "0");
  const logs = await listAuditLogs(c.env.DB, limit, offset);
  await logAction(c.env.DB, { id: user.sub, email: user.email }, "admin_view", "user", "audit");
  return c.json({ logs });
});

adminApp.get("/conversions", async (c) => {
  const user = c.get("user");
  const limit = Number(c.req.query("limit") ?? "1000");
  const offset = Number(c.req.query("offset") ?? "0");
  const conversions = await listAllConversions(c.env.DB, limit, offset);
  await logAction(
    c.env.DB,
    { id: user.sub, email: user.email },
    "admin_view",
    "file",
    "conversions"
  );
  return c.json({ conversions });
});

adminApp.get("/conversion-quotas", async (c) => {
  const user = c.get("user");
  const quotas = await listConversionQuotas(c.env.DB);
  await logAction(
    c.env.DB,
    { id: user.sub, email: user.email },
    "admin_view",
    "user",
    "conversion_quotas"
  );
  return c.json({ quotas });
});

export default adminApp;
