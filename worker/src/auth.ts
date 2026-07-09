import { SignJWT, jwtVerify } from "jose";
import type { User } from "./schema";

export type AuthEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  WORKER_JWT_SECRET: string;
  FRONTEND_URL: string;
  ADMIN_EMAIL: string;
};

export type TokenPayload = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: boolean;
};

export function getJwtSecret(env: AuthEnv): Uint8Array {
  return new TextEncoder().encode(env.WORKER_JWT_SECRET);
}

export async function createJwt(env: AuthEnv, user: User): Promise<string> {
  const secret = getJwtSecret(env);
  return new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
    is_admin: user.is_admin === 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyJwt(env: AuthEnv, token: string): Promise<TokenPayload> {
  const secret = getJwtSecret(env);
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    name: (payload.name as string | null) ?? null,
    picture: (payload.picture as string | null) ?? null,
    is_admin: payload.is_admin === true,
  };
}

export function buildGoogleAuthUrl(env: AuthEnv, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  env: AuthEnv,
  code: string,
  redirectUri: string
): Promise<{
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${tokenResponse.status} ${text}`);
  }

  const tokenData = (await tokenResponse.json()) as { id_token: string };
  const parts = tokenData.id_token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid id_token format");
  }
  const payload = JSON.parse(atob(parts[1])) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
