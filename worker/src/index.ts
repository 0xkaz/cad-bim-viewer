import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import adminApp from "./admin";
import authApp from "./auth-routes";
import conversionsApp from "./conversions";
import filesApp from "./files";
import shareApp from "./share";
import type { Env } from "./types";

const app = new Hono<Env>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.FRONTEND_URL;
      return origin === allowed ? origin : allowed;
    },
    credentials: true,
  })
);

app.route("/api/auth", authApp);
app.route("/api", conversionsApp);
app.route("/api/files", filesApp);
app.route("/api/share", shareApp);
app.route("/api/admin", adminApp);

app.get("/api/health", (c) => c.json({ status: "ok" }));

// Public capability flags so the UI can hide features that require an external
// converter service. Conversion is disabled unless CONVERTER_URL is configured.
app.get("/api/config", (c) =>
  c.json({
    conversion_enabled: Boolean(c.env.CONVERTER_URL),
    jww_enabled: Boolean(c.env.JWW_CONVERTER_URL),
  })
);

export default app;
export type { Env } from "./types";
