import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { logAction } from "./audit";
import { buildGoogleAuthUrl, createJwt, exchangeGoogleCode } from "./auth";
import { createUser, generateId, getUserByEmail } from "./db";
import { authMiddleware } from "./middleware";
import type { Env } from "./types";

const authApp = new Hono<Env>();

authApp.get("/google", async (c) => {
  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/google/callback", c.req.url).toString();
  const url = buildGoogleAuthUrl(c.env, redirectUri, state);
  return c.json({ url });
});

authApp.get(
  "/google/callback",
  zValidator(
    "query",
    z.object({
      code: z.string(),
      state: z.string(),
    })
  ),
  async (c) => {
    const { code } = c.req.valid("query");
    try {
      const redirectUri = new URL("/api/auth/google/callback", c.req.url).toString();
      const googleUser = await exchangeGoogleCode(c.env, code, redirectUri);
      let user = await getUserByEmail(c.env.DB, googleUser.email);
      const isAdmin = googleUser.email === c.env.ADMIN_EMAIL;
      if (!user) {
        user = await createUser(c.env.DB, {
          id: generateId(),
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          is_admin: isAdmin ? 1 : 0,
        });
      } else if (isAdmin && user.is_admin === 0) {
        await c.env.DB.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").bind(user.id).run();
        user.is_admin = 1;
      }

      const token = await createJwt(c.env, user);
      await logAction(c.env.DB, { id: user.id, email: user.email }, "login", "user", user.id);

      return c.redirect(`${c.env.FRONTEND_URL}/login#token=${encodeURIComponent(token)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      return c.redirect(`${c.env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);
    }
  }
);

authApp.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

export default authApp;
