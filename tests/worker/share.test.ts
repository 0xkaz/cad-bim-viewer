import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../worker/src/index";

const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  format TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL,
  fragments_r2_key TEXT,
  fragments_size_bytes INTEGER,
  fragments_created_at TEXT,
  is_public INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  delete_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
`;

async function setupSchema(): Promise<void> {
  for (const statement of SETUP_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await env.DB.prepare(`${statement};`).run();
  }
}

async function createToken(payload: { sub: string; email: string }) {
  const secret = new TextEncoder().encode(env.WORKER_JWT_SECRET);
  return new SignJWT({
    email: payload.email,
    name: "Test User",
    picture: null,
    is_admin: false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function createUser(id: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, picture, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, email, "Test User", null, 0, new Date().toISOString())
    .run();
}

async function createFile(id: string, ownerId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO files (
      id, owner_id, filename, original_name, mime_type, size_bytes, format,
      r2_key, r2_bucket, fragments_r2_key, fragments_size_bytes, fragments_created_at,
      is_public, is_deleted, deleted_at, delete_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      ownerId,
      "model.ifc",
      "model.ifc",
      "application/octet-stream",
      100,
      "ifc",
      `uploads/${ownerId}/${id}/model.ifc`,
      "cad-bim-viewer-uploads",
      null,
      null,
      null,
      0,
      0,
      null,
      null,
      new Date().toISOString(),
      new Date().toISOString()
    )
    .run();
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function createShare(fileId: string, token: string): Promise<string> {
  const response = await fetchApp(
    new Request(`http://localhost/api/share/files/${fileId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { token: string };
  return body.token;
}

describe("share API", () => {
  beforeAll(async () => {
    await setupSchema();
  });

  it("enables link access when a share link is created", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const email = `${userId}@example.com`;
    await createUser(userId, email);
    await createFile(fileId, userId);
    const authToken = await createToken({ sub: userId, email });

    const shareToken = await createShare(fileId, authToken);
    const fileRow = await env.DB.prepare("SELECT is_public FROM files WHERE id = ?")
      .bind(fileId)
      .first<{ is_public: number }>();

    expect(fileRow?.is_public).toBe(1);

    const publicResponse = await fetchApp(new Request(`http://localhost/api/share/${shareToken}`));
    expect(publicResponse.status).toBe(200);
  });

  it("blocks existing share links when link access is disabled", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const email = `${userId}@example.com`;
    await createUser(userId, email);
    await createFile(fileId, userId);
    const authToken = await createToken({ sub: userId, email });
    const shareToken = await createShare(fileId, authToken);

    const disableResponse = await fetchApp(
      new Request(`http://localhost/api/files/${fileId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ is_public: false }),
      })
    );
    expect(disableResponse.status).toBe(200);

    const publicResponse = await fetchApp(new Request(`http://localhost/api/share/${shareToken}`));
    expect(publicResponse.status).toBe(403);
  });
});
