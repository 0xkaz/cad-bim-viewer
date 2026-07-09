import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { logAction } from "./audit";
import {
  generateId,
  getConversionById,
  getFileById,
  getOrCreateQuota,
  incrementQuota,
  insertConversion,
  insertFile,
  listConversionsByFile,
  sanitizeFilename,
  updateConversionStatus,
} from "./db";
import { authMiddleware } from "./middleware";
import { getObject, makeObjectKey, putObject } from "./r2";
import { type ConversionFormat, CreateConversionSchema, type FileFormat } from "./schema";
import type { Env } from "./types";

const conversionsApp = new Hono<Env>();

const SUPPORTED_DIRECTIONS: Record<FileFormat, ConversionFormat[]> = {
  ifc: ["dxf", "dwg"],
  dxf: ["ifc"],
  dwg: ["dxf", "ifc"],
  jww: ["dxf", "dwg"],
  unknown: [],
};

conversionsApp.use("/files/*", authMiddleware);
conversionsApp.use("/conversions/*", authMiddleware);

function converterEndpoint(
  sourceFormat: FileFormat,
  targetFormat: ConversionFormat
): string | null {
  if (sourceFormat === "ifc" && targetFormat === "dxf") return "/convert/ifc-to-dxf";
  if (sourceFormat === "ifc" && targetFormat === "dwg") return "/convert/ifc-to-dwg";
  if (sourceFormat === "dxf" && targetFormat === "ifc") return "/convert/dxf-to-ifc";
  if (sourceFormat === "dwg" && targetFormat === "dxf") return "/convert/dwg-to-dxf";
  if (sourceFormat === "dwg" && targetFormat === "ifc") return "/convert/dwg-to-ifc";
  if (sourceFormat === "jww" && targetFormat === "dxf") return "/convert/jww-to-dxf";
  if (sourceFormat === "jww" && targetFormat === "dwg") return "/convert/jww-to-dwg";
  return null;
}

function targetMimeType(format: ConversionFormat): string {
  switch (format) {
    case "dxf":
      return "application/dxf";
    case "dwg":
      return "application/dwg";
    case "ifc":
      return "application/x-step";
    default:
      return "application/octet-stream";
  }
}

conversionsApp.post("/files/:id/convert", zValidator("json", CreateConversionSchema), async (c) => {
  const user = c.get("user");
  const sourceFileId = c.req.param("id");
  const { target_format: targetFormat } = c.req.valid("json");

  // Conversion requires an external converter service. When it is not configured
  // the feature is disabled rather than silently queueing jobs that never run.
  if (!c.env.CONVERTER_URL) {
    return c.json({ error: "Conversion is not enabled on this deployment" }, 503);
  }

  const file = await getFileById(c.env.DB, sourceFileId);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const supported = SUPPORTED_DIRECTIONS[file.format];
  if (!supported.includes(targetFormat)) {
    return c.json({ error: `Cannot convert ${file.format} to ${targetFormat}` }, 400);
  }

  if (!user.is_admin) {
    const quota = await getOrCreateQuota(c.env.DB, user.sub);
    if (quota.used_count >= 5) {
      return c.json({ error: "Monthly conversion quota exceeded" }, 429);
    }
  }

  const conversionId = generateId();
  await incrementQuota(c.env.DB, user.sub);

  const conversion = await insertConversion(c.env.DB, {
    id: conversionId,
    owner_id: user.sub,
    source_file_id: sourceFileId,
    source_format: file.format,
    target_format: targetFormat,
    target_file_id: null,
    status: "queued",
    provider: c.env.CONVERTER_URL ?? null,
    started_at: null,
    completed_at: null,
    error_message: null,
  });

  await logAction(c.env.DB, { id: user.sub, email: user.email }, "convert", "file", sourceFileId, {
    conversion_id: conversionId,
    target_format: targetFormat,
  });

  if (c.env.CONVERTER_URL) {
    const ctx = c.executionCtx;
    if (ctx) {
      ctx.waitUntil(runConversion(c.env, conversion, file));
    } else {
      // Synchronous fallback for environments without execution context
      await runConversion(c.env, conversion, file);
    }
  }

  return c.json({ conversion }, 202);
});

conversionsApp.get("/conversions/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const conversion = await getConversionById(c.env.DB, id);
  if (!conversion || conversion.owner_id !== user.sub) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ conversion });
});

conversionsApp.get("/files/:id/conversions", async (c) => {
  const user = c.get("user");
  const fileId = c.req.param("id");
  const file = await getFileById(c.env.DB, fileId);
  if (!file || file.owner_id !== user.sub || file.is_deleted === 1) {
    return c.json({ error: "Not found" }, 404);
  }
  const conversions = await listConversionsByFile(c.env.DB, fileId);
  return c.json({ conversions });
});

async function runConversion(
  env: Env["Bindings"],
  conversion: Awaited<ReturnType<typeof insertConversion>>,
  sourceFile: Awaited<ReturnType<typeof getFileById>> & NonNullable<unknown>
): Promise<void> {
  const db = env.DB;
  const bucket = env.BUCKET;
  const converterUrl = env.CONVERTER_URL;
  if (!converterUrl) return;

  await updateConversionStatus(db, conversion.id, "running");

  const sourceObject = await getObject(bucket, sourceFile.r2_key);
  if (!sourceObject) {
    await updateConversionStatus(db, conversion.id, "failed", {
      error_message: "Source file missing from storage",
    });
    return;
  }

  let sourceBytes: ArrayBuffer;
  try {
    sourceBytes = await sourceObject.arrayBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read source file";
    await updateConversionStatus(db, conversion.id, "failed", { error_message: message });
    return;
  }

  const endpoint = converterEndpoint(conversion.source_format, conversion.target_format);
  if (!endpoint) {
    await updateConversionStatus(db, conversion.id, "failed", {
      error_message: `Unsupported conversion ${conversion.source_format} -> ${conversion.target_format}`,
    });
    return;
  }

  // JWW conversions use a dedicated external endpoint when configured
  const isJww = conversion.source_format === "jww";
  const baseUrl = isJww ? (env.JWW_CONVERTER_URL ?? converterUrl) : converterUrl;
  if (isJww && !env.JWW_CONVERTER_URL) {
    await updateConversionStatus(db, conversion.id, "failed", {
      error_message: "JWW converter not configured",
    });
    return;
  }

  const form = new FormData();
  form.append(
    "file",
    new File([sourceBytes], sourceFile.filename, {
      type: sourceFile.mime_type || "application/octet-stream",
    })
  );

  let convertedBytes: ArrayBuffer;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "Conversion failed");
      await updateConversionStatus(db, conversion.id, "failed", { error_message: body });
      return;
    }
    convertedBytes = await response.arrayBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion request failed";
    await updateConversionStatus(db, conversion.id, "failed", { error_message: message });
    return;
  }

  if (convertedBytes.byteLength === 0) {
    await updateConversionStatus(db, conversion.id, "failed", {
      error_message: "Converter returned empty file",
    });
    return;
  }

  const targetFileId = generateId();
  const baseName = sourceFile.filename.replace(/\.[^.]+$/, "");
  const targetFilename = sanitizeFilename(`${baseName}.${conversion.target_format}`);
  const targetOriginalName = `${sourceFile.original_name.replace(/\.[^.]+$/, "")}.${conversion.target_format}`;
  const targetKey = makeObjectKey(conversion.owner_id, targetFileId, targetFilename);

  try {
    await putObject(
      bucket,
      targetKey,
      convertedBytes,
      {
        owner_id: conversion.owner_id,
        file_id: targetFileId,
        original_name: targetOriginalName,
        converted_from: conversion.source_file_id,
      },
      {
        contentType: targetMimeType(conversion.target_format),
        contentDisposition: `attachment; filename="${targetFilename}"`,
      }
    );

    await insertFile(db, {
      id: targetFileId,
      owner_id: conversion.owner_id,
      filename: targetFilename,
      original_name: targetOriginalName,
      mime_type: targetMimeType(conversion.target_format),
      size_bytes: convertedBytes.byteLength,
      format: conversion.target_format,
      r2_key: targetKey,
      r2_bucket: sourceFile.r2_bucket,
      fragments_r2_key: null,
      fragments_size_bytes: null,
      fragments_created_at: null,
      is_public: 0,
      is_deleted: 0,
      deleted_at: null,
      delete_reason: null,
    });

    await updateConversionStatus(db, conversion.id, "completed", { target_file_id: targetFileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to store converted file";
    await updateConversionStatus(db, conversion.id, "failed", { error_message: message });
  }
}

export default conversionsApp;
