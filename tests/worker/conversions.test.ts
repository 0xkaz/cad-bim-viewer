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

CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  source_format TEXT NOT NULL,
  target_format TEXT NOT NULL,
  target_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversions_owner ON conversions(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversions_source ON conversions(source_file_id);
CREATE INDEX IF NOT EXISTS idx_conversions_status ON conversions(status);

CREATE TABLE IF NOT EXISTS conversion_quotas (
  user_id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`;

async function setupSchema(): Promise<void> {
  for (const statement of SETUP_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await env.DB.prepare(`${statement};`).run();
  }
}

async function createToken(payload: {
  sub: string;
  email: string;
  is_admin?: boolean;
  name?: string | null;
  picture?: string | null;
}) {
  const secret = new TextEncoder().encode(env.WORKER_JWT_SECRET);
  return new SignJWT({
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    is_admin: payload.is_admin ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function createUser(id: string, email: string, isAdmin = false): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, email, name, picture, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, email, "Test User", null, isAdmin ? 1 : 0, new Date().toISOString())
    .run();
}

async function createFile(
  id: string,
  ownerId: string,
  filename: string,
  format: string
): Promise<void> {
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
      filename,
      filename,
      "application/octet-stream",
      100,
      format,
      `uploads/${ownerId}/${id}/${filename}`,
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

async function requestConvert(
  fileId: string,
  targetFormat: string,
  token: string
): Promise<Response> {
  const req = new Request(`http://localhost/api/files/${fileId}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ target_format: targetFormat }),
  });
  const ctx = createExecutionContext();
  // Conversion is gated on CONVERTER_URL; set it so the pipeline path is exercised.
  const res = await app.fetch(req, { ...env, CONVERTER_URL: "https://converter.test" }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("conversion API", () => {
  beforeAll(async () => {
    await setupSchema();
  });

  it("queues a supported conversion for the file owner", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    await createUser(userId, "user@example.com");
    await createFile(fileId, userId, "drawing.dwg", "dwg");
    const token = await createToken({ sub: userId, email: "user@example.com" });

    const res = await requestConvert(fileId, "dxf", token);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { conversion: { status: string; target_format: string } };
    expect(body.conversion.status).toBe("queued");
    expect(body.conversion.target_format).toBe("dxf");
  });

  it("returns 503 when the converter service is not configured", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    await createUser(userId, "user@example.com");
    await createFile(fileId, userId, "drawing.dwg", "dwg");
    const token = await createToken({ sub: userId, email: "user@example.com" });

    const req = new Request(`http://localhost/api/files/${fileId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target_format: "dxf" }),
    });
    const ctx = createExecutionContext();
    // No CONVERTER_URL → conversion disabled.
    const res = await app.fetch(req, { ...env, CONVERTER_URL: "" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(503);
  });

  it("exposes conversion capability via /api/config", async () => {
    const enabledCtx = createExecutionContext();
    const enabledRes = await app.fetch(
      new Request("http://localhost/api/config"),
      { ...env, CONVERTER_URL: "https://converter.test" },
      enabledCtx
    );
    await waitOnExecutionContext(enabledCtx);
    expect(((await enabledRes.json()) as { conversion_enabled: boolean }).conversion_enabled).toBe(
      true
    );

    const disabledCtx = createExecutionContext();
    const disabledRes = await app.fetch(
      new Request("http://localhost/api/config"),
      { ...env, CONVERTER_URL: "" },
      disabledCtx
    );
    await waitOnExecutionContext(disabledCtx);
    expect(((await disabledRes.json()) as { conversion_enabled: boolean }).conversion_enabled).toBe(
      false
    );
  });

  it("rejects unsupported conversion directions", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    await createUser(userId, "user@example.com");
    await createFile(fileId, userId, "model.ifc", "ifc");
    const token = await createToken({ sub: userId, email: "user@example.com" });

    const res = await requestConvert(fileId, "ifc", token);
    expect(res.status).toBe(400);
  });

  it("enforces the monthly quota for non-admin users", async () => {
    const userId = crypto.randomUUID();
    await createUser(userId, "user@example.com");
    const token = await createToken({ sub: userId, email: "user@example.com" });

    for (let i = 0; i < 5; i++) {
      const fileId = crypto.randomUUID();
      await createFile(fileId, userId, `drawing${i}.dwg`, "dwg");
      const res = await requestConvert(fileId, "dxf", token);
      expect(res.status).toBe(202);
    }

    const overflowFileId = crypto.randomUUID();
    await createFile(overflowFileId, userId, "drawing-overflow.dwg", "dwg");
    const res = await requestConvert(overflowFileId, "dxf", token);
    expect(res.status).toBe(429);
  });

  it("allows admins to exceed the quota", async () => {
    const userId = crypto.randomUUID();
    await createUser(userId, "admin@example.com", true);
    const token = await createToken({ sub: userId, email: "admin@example.com", is_admin: true });

    for (let i = 0; i < 6; i++) {
      const fileId = crypto.randomUUID();
      await createFile(fileId, userId, `admin-drawing${i}.dwg`, "dwg");
      const res = await requestConvert(fileId, "dxf", token);
      expect(res.status).toBe(202);
    }
  });

  it("lists file conversions", async () => {
    const userId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    await createUser(userId, "user@example.com");
    await createFile(fileId, userId, "drawing.dwg", "dwg");
    const token = await createToken({ sub: userId, email: "user@example.com" });

    await requestConvert(fileId, "dxf", token);

    const req = new Request(`http://localhost/api/files/${fileId}/conversions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { conversions: unknown[] };
    expect(body.conversions).toHaveLength(1);
  });
});
