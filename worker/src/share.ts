import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { logAction } from "./audit";
import {
  deleteShareToken,
  generateId,
  generateShareToken,
  getFileById,
  getShareToken,
  insertShareToken,
  listShareTokensByFile,
  updateFileVisibility,
} from "./db";
import { authMiddleware } from "./middleware";
import { getObject } from "./r2";
import { CreateShareSchema } from "./schema";
import type { Env } from "./types";

const shareApp = new Hono<Env>();

// Public share endpoints (no auth)
shareApp.get("/:token", async (c) => {
  const token = c.req.param("token");
  const share = await getShareToken(c.env.DB, token);
  if (!share) {
    return c.json({ error: "Not found or expired" }, 404);
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: "Expired" }, 410);
  }
  const file = await getFileById(c.env.DB, share.file_id);
  if (!file || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  if (file.is_public !== 1) {
    return c.json({ error: "Share link access is disabled" }, 403);
  }
  return c.json({
    share: {
      token: share.token,
      expires_at: share.expires_at,
      created_at: share.created_at,
    },
    file: {
      id: file.id,
      original_name: file.original_name,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      format: file.format,
      created_at: file.created_at,
    },
  });
});

shareApp.get("/:token/download", async (c) => {
  const token = c.req.param("token");
  const share = await getShareToken(c.env.DB, token);
  if (!share) {
    return c.json({ error: "Not found or expired" }, 404);
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: "Expired" }, 410);
  }
  const file = await getFileById(c.env.DB, share.file_id);
  if (!file || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  if (file.is_public !== 1) {
    return c.json({ error: "Share link access is disabled" }, 403);
  }

  const object = await getObject(c.env.BUCKET, file.r2_key);
  if (!object || !object.body) {
    return c.json({ error: "File not found in storage" }, 404);
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.size_bytes ?? object.size),
    },
  });
});

shareApp.get("/:token/fragments", async (c) => {
  const token = c.req.param("token");
  const share = await getShareToken(c.env.DB, token);
  if (!share) {
    return c.json({ error: "Not found or expired" }, 404);
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: "Expired" }, 410);
  }
  const file = await getFileById(c.env.DB, share.file_id);
  if (!file || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  if (file.is_public !== 1) {
    return c.json({ error: "Share link access is disabled" }, 403);
  }
  return c.json({
    has_fragments: file.fragments_r2_key !== null,
    fragments_r2_key: file.fragments_r2_key,
    fragments_size_bytes: file.fragments_size_bytes,
    fragments_created_at: file.fragments_created_at,
  });
});

shareApp.get("/:token/fragments/download", async (c) => {
  const token = c.req.param("token");
  const share = await getShareToken(c.env.DB, token);
  if (!share) {
    return c.json({ error: "Not found or expired" }, 404);
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: "Expired" }, 410);
  }
  const file = await getFileById(c.env.DB, share.file_id);
  if (!file || file.is_deleted === 1 || !file.fragments_r2_key) {
    return c.json({ error: "Not found" }, 404);
  }
  if (file.is_public !== 1) {
    return c.json({ error: "Share link access is disabled" }, 403);
  }

  const object = await getObject(c.env.BUCKET, file.fragments_r2_key);
  if (!object || !object.body) {
    return c.json({ error: "Fragments not found in storage" }, 404);
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.id}.frag"`,
      "Content-Length": String(file.fragments_size_bytes ?? object.size),
    },
  });
});

// Authenticated share management
shareApp.use("/files/*", authMiddleware);

shareApp.get("/files/:fileId", async (c) => {
  const user = c.get("user");
  const fileId = c.req.param("fileId");
  const file = await getFileById(c.env.DB, fileId);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  const tokens = await listShareTokensByFile(c.env.DB, fileId);
  return c.json({ tokens });
});

shareApp.post("/files/:fileId", zValidator("json", CreateShareSchema), async (c) => {
  const user = c.get("user");
  const fileId = c.req.param("fileId");
  const body = c.req.valid("json");
  const file = await getFileById(c.env.DB, fileId);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const expiresAt = body.expires_in_hours
    ? new Date(Date.now() + body.expires_in_hours * 60 * 60 * 1000).toISOString()
    : null;

  const tokenValue = generateShareToken();
  if (file.is_public !== 1) {
    await updateFileVisibility(c.env.DB, fileId, true);
  }
  await insertShareToken(c.env.DB, {
    id: generateId(),
    file_id: fileId,
    token: tokenValue,
    expires_at: expiresAt,
    created_by: user.sub,
  });

  await logAction(c.env.DB, { id: user.sub, email: user.email }, "share", "file", fileId, {
    expires_at: expiresAt,
  });

  return c.json({
    token: tokenValue,
    expires_at: expiresAt,
    share_url: `${c.env.FRONTEND_URL}/share/${tokenValue}`,
  });
});

shareApp.delete("/files/:fileId/:token", async (c) => {
  const user = c.get("user");
  const fileId = c.req.param("fileId");
  const token = c.req.param("token");
  const file = await getFileById(c.env.DB, fileId);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  await deleteShareToken(c.env.DB, token);
  const remainingTokens = await listShareTokensByFile(c.env.DB, fileId);
  if (remainingTokens.length === 0) {
    await updateFileVisibility(c.env.DB, fileId, false);
  }
  await logAction(
    c.env.DB,
    { id: user.sub, email: user.email },
    "revoke_share",
    "share_token",
    token,
    { file_id: fileId }
  );
  return c.json({ success: true });
});

export default shareApp;
