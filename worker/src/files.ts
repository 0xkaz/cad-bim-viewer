import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { logAction } from "./audit";
import {
  detectFormat,
  generateId,
  getFileById,
  insertFile,
  listFilesByOwner,
  sanitizeFilename,
  softDeleteFile,
  updateFileFragments,
  updateFileVisibility,
} from "./db";
import { authMiddleware } from "./middleware";
import { deleteObject, getObject, makeFragmentsKey, makeObjectKey, putObject } from "./r2";
import { DeleteFileSchema, UpdateFileSchema } from "./schema";
import type { Env } from "./types";

const filesApp = new Hono<Env>();

filesApp.use("*", authMiddleware);

filesApp.get("/", async (c) => {
  const user = c.get("user");
  const files = await listFilesByOwner(c.env.DB, user.sub, false);
  return c.json({ files });
});

filesApp.post("/", async (c) => {
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("stream" in file)) {
    return c.json({ error: "No file provided" }, 400);
  }
  const uploadedFile = file as File;

  const fileId = generateId();
  const originalName = uploadedFile.name;
  const filename = sanitizeFilename(originalName);
  const format = detectFormat(originalName);
  const key = makeObjectKey(user.sub, fileId, filename);

  await putObject(
    c.env.BUCKET,
    key,
    uploadedFile.stream() as unknown as ReadableStream,
    {
      owner_id: user.sub,
      file_id: fileId,
      original_name: originalName,
    },
    {
      contentType: uploadedFile.type || "application/octet-stream",
      contentDisposition: `attachment; filename="${filename}"`,
    }
  );

  const record = await insertFile(c.env.DB, {
    id: fileId,
    owner_id: user.sub,
    filename,
    original_name: originalName,
    mime_type: uploadedFile.type || "application/octet-stream",
    size_bytes: uploadedFile.size,
    format,
    r2_key: key,
    r2_bucket: "cad-bim-viewer-uploads",
    fragments_r2_key: null,
    fragments_size_bytes: null,
    fragments_created_at: null,
    is_public: 0,
    is_deleted: 0,
    deleted_at: null,
    delete_reason: null,
  });

  await logAction(c.env.DB, { id: user.sub, email: user.email }, "upload", "file", fileId, {
    filename,
    format,
    size_bytes: uploadedFile.size,
  });

  return c.json({ file: record }, 201);
});

filesApp.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ file });
});

filesApp.get("/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
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

filesApp.get("/:id/fragments", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    has_fragments: file.fragments_r2_key !== null,
    fragments_r2_key: file.fragments_r2_key,
    fragments_size_bytes: file.fragments_size_bytes,
    fragments_created_at: file.fragments_created_at,
  });
});

filesApp.get("/:id/fragments/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1 || !file.fragments_r2_key) {
    return c.json({ error: "Not found" }, 404);
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

filesApp.post("/:id/fragments", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await c.req.formData();
  const fragmentsFile = formData.get("file");
  if (!fragmentsFile || typeof fragmentsFile !== "object" || !("stream" in fragmentsFile)) {
    return c.json({ error: "No fragments file provided" }, 400);
  }
  const uploadedFragments = fragmentsFile as File;

  const fragmentsKey = makeFragmentsKey(id);
  await putObject(
    c.env.BUCKET,
    fragmentsKey,
    uploadedFragments.stream() as unknown as ReadableStream,
    {
      owner_id: user.sub,
      file_id: id,
      type: "fragments",
    },
    {
      contentType: "application/octet-stream",
      contentDisposition: `attachment; filename="${id}.frag"`,
    }
  );

  await updateFileFragments(c.env.DB, id, {
    r2_key: fragmentsKey,
    size_bytes: uploadedFragments.size,
  });

  const updated = await getFileById(c.env.DB, id);
  return c.json({ file: updated });
});

filesApp.patch("/:id", zValidator("json", UpdateFileSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }

  if (body.is_public !== undefined) {
    await updateFileVisibility(c.env.DB, id, body.is_public);
    await logAction(
      c.env.DB,
      { id: user.sub, email: user.email },
      body.is_public ? "publish" : "unpublish",
      "file",
      id
    );
  }

  const updated = await getFileById(c.env.DB, id);
  return c.json({ file: updated });
});

filesApp.delete("/:id", zValidator("json", DeleteFileSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const file = await getFileById(c.env.DB, id);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }

  await softDeleteFile(c.env.DB, id, body.reason);
  await deleteObject(c.env.BUCKET, file.r2_key);
  if (file.fragments_r2_key) {
    await deleteObject(c.env.BUCKET, file.fragments_r2_key);
  }

  await logAction(c.env.DB, { id: user.sub, email: user.email }, "delete", "file", id, {
    reason: body.reason,
  });

  return c.json({ success: true });
});

export default filesApp;
