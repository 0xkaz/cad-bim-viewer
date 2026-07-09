import type { D1Database } from "@cloudflare/workers-types";
import type {
  AuditAction,
  AuditTargetType,
  Conversion,
  ConversionQuota,
  ConversionStatus,
  FileFormat,
  FileRecord,
  User,
} from "./schema";
export type { AuditAction, AuditTargetType } from "./schema";

export type DBEnv = {
  DB: D1Database;
};

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!row) return null;
  return row as User;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!row) return null;
  return row as User;
}

export async function createUser(db: D1Database, user: Omit<User, "created_at">): Promise<User> {
  const createdAt = nowIso();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(user.id, user.email, user.name, user.picture, user.is_admin, createdAt)
    .run();
  return { ...user, created_at: createdAt };
}

export async function getFileById(db: D1Database, id: string): Promise<FileRecord | null> {
  const row = await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first();
  if (!row) return null;
  return row as FileRecord;
}

export async function listFilesByOwner(
  db: D1Database,
  ownerId: string,
  includeDeleted = false
): Promise<FileRecord[]> {
  let stmt = db.prepare("SELECT * FROM files WHERE owner_id = ?").bind(ownerId);
  if (!includeDeleted) {
    stmt = db.prepare("SELECT * FROM files WHERE owner_id = ? AND is_deleted = 0").bind(ownerId);
  }
  const { results } = await stmt.all<FileRecord>();
  return results ?? [];
}

export async function listAllFiles(db: D1Database): Promise<FileRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM files ORDER BY created_at DESC")
    .all<FileRecord>();
  return results ?? [];
}

export async function insertFile(
  db: D1Database,
  file: Omit<FileRecord, "created_at" | "updated_at">
): Promise<FileRecord> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO files (
        id, owner_id, filename, original_name, mime_type, size_bytes, format,
        r2_key, r2_bucket, fragments_r2_key, fragments_size_bytes, fragments_created_at,
        is_public, is_deleted, deleted_at, delete_reason,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      file.id,
      file.owner_id,
      file.filename,
      file.original_name,
      file.mime_type,
      file.size_bytes,
      file.format,
      file.r2_key,
      file.r2_bucket,
      file.fragments_r2_key ?? null,
      file.fragments_size_bytes ?? null,
      file.fragments_created_at ?? null,
      file.is_public,
      file.is_deleted,
      file.deleted_at,
      file.delete_reason,
      now,
      now
    )
    .run();
  return { ...file, created_at: now, updated_at: now };
}

export async function updateFileVisibility(
  db: D1Database,
  fileId: string,
  isPublic: boolean
): Promise<void> {
  await db
    .prepare("UPDATE files SET is_public = ?, updated_at = ? WHERE id = ?")
    .bind(isPublic ? 1 : 0, nowIso(), fileId)
    .run();
}

export async function softDeleteFile(
  db: D1Database,
  fileId: string,
  reason: string
): Promise<void> {
  await db
    .prepare(
      "UPDATE files SET is_deleted = 1, deleted_at = ?, delete_reason = ?, updated_at = ? WHERE id = ?"
    )
    .bind(nowIso(), reason, nowIso(), fileId)
    .run();
}

export async function updateFileFragments(
  db: D1Database,
  fileId: string,
  fragments: {
    r2_key: string;
    size_bytes: number;
  }
): Promise<void> {
  await db
    .prepare(
      "UPDATE files SET fragments_r2_key = ?, fragments_size_bytes = ?, fragments_created_at = ?, updated_at = ? WHERE id = ?"
    )
    .bind(fragments.r2_key, fragments.size_bytes, nowIso(), nowIso(), fileId)
    .run();
}

export async function insertShareToken(
  db: D1Database,
  token: {
    id: string;
    file_id: string;
    token: string;
    expires_at: string | null;
    created_by: string;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO share_tokens (id, file_id, token, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(token.id, token.file_id, token.token, token.expires_at, nowIso(), token.created_by)
    .run();
}

export async function getShareToken(db: D1Database, token: string) {
  const row = await db.prepare("SELECT * FROM share_tokens WHERE token = ?").bind(token).first<{
    id: string;
    file_id: string;
    token: string;
    expires_at: string | null;
    created_at: string;
    created_by: string;
  }>();
  return row ?? null;
}

export async function deleteShareToken(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM share_tokens WHERE token = ?").bind(token).run();
}

export async function listShareTokensByFile(db: D1Database, fileId: string) {
  const { results } = await db
    .prepare("SELECT * FROM share_tokens WHERE file_id = ? ORDER BY created_at DESC")
    .bind(fileId)
    .all<{
      id: string;
      file_id: string;
      token: string;
      expires_at: string | null;
      created_at: string;
      created_by: string;
    }>();
  return results ?? [];
}

export async function insertAuditLog(
  db: D1Database,
  log: {
    actor_id: string;
    actor_email: string;
    action: AuditAction;
    target_type: AuditTargetType;
    target_id: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      log.actor_id,
      log.actor_email,
      log.action,
      log.target_type,
      log.target_id,
      log.details ? JSON.stringify(log.details) : null,
      nowIso()
    )
    .run();
}

export async function listAuditLogs(db: D1Database, limit = 1000, offset = 0) {
  const { results } = await db
    .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<{
      id: number;
      actor_id: string;
      actor_email: string;
      action: AuditAction;
      target_type: AuditTargetType;
      target_id: string;
      details: string | null;
      created_at: string;
    }>();
  return (results ?? []).map((r) => ({
    ...r,
    details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null,
  }));
}

export async function listAllUsers(db: D1Database): Promise<User[]> {
  const { results } = await db.prepare("SELECT * FROM users ORDER BY created_at DESC").all<User>();
  return results ?? [];
}

export async function insertConversion(
  db: D1Database,
  conversion: Omit<Conversion, "created_at" | "updated_at">
): Promise<Conversion> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO conversions (
        id, owner_id, source_file_id, source_format, target_format, target_file_id,
        status, provider, started_at, completed_at, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      conversion.id,
      conversion.owner_id,
      conversion.source_file_id,
      conversion.source_format,
      conversion.target_format,
      conversion.target_file_id ?? null,
      conversion.status,
      conversion.provider ?? null,
      conversion.started_at ?? null,
      conversion.completed_at ?? null,
      conversion.error_message ?? null,
      now,
      now
    )
    .run();
  return { ...conversion, created_at: now, updated_at: now };
}

export async function getConversionById(db: D1Database, id: string): Promise<Conversion | null> {
  const row = await db.prepare("SELECT * FROM conversions WHERE id = ?").bind(id).first();
  if (!row) return null;
  return row as Conversion;
}

export async function updateConversionStatus(
  db: D1Database,
  id: string,
  status: ConversionStatus,
  options?: { target_file_id?: string; error_message?: string }
): Promise<void> {
  const now = nowIso();
  if (status === "running") {
    await db
      .prepare("UPDATE conversions SET status = ?, started_at = ?, updated_at = ? WHERE id = ?")
      .bind(status, now, now, id)
      .run();
  } else if (status === "completed") {
    await db
      .prepare(
        "UPDATE conversions SET status = ?, target_file_id = ?, completed_at = ?, updated_at = ? WHERE id = ?"
      )
      .bind(status, options?.target_file_id ?? null, now, now, id)
      .run();
  } else if (status === "failed") {
    await db
      .prepare(
        "UPDATE conversions SET status = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?"
      )
      .bind(status, options?.error_message ?? null, now, now, id)
      .run();
  } else {
    await db
      .prepare("UPDATE conversions SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, now, id)
      .run();
  }
}

export async function listConversionsByOwner(
  db: D1Database,
  ownerId: string
): Promise<Conversion[]> {
  const { results } = await db
    .prepare("SELECT * FROM conversions WHERE owner_id = ? ORDER BY created_at DESC")
    .bind(ownerId)
    .all<Conversion>();
  return results ?? [];
}

export async function listConversionsByFile(db: D1Database, fileId: string): Promise<Conversion[]> {
  const { results } = await db
    .prepare("SELECT * FROM conversions WHERE source_file_id = ? ORDER BY created_at DESC")
    .bind(fileId)
    .all<Conversion>();
  return results ?? [];
}

export async function listAllConversions(
  db: D1Database,
  limit = 1000,
  offset = 0
): Promise<Conversion[]> {
  const { results } = await db
    .prepare("SELECT * FROM conversions ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<Conversion>();
  return results ?? [];
}

export function currentConversionPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getOrCreateQuota(
  db: D1Database,
  userId: string,
  period = currentConversionPeriod()
): Promise<ConversionQuota> {
  const row = await db
    .prepare("SELECT * FROM conversion_quotas WHERE user_id = ?")
    .bind(userId)
    .first<ConversionQuota>();
  if (row) {
    if (row.period !== period) {
      await db
        .prepare(
          "UPDATE conversion_quotas SET period = ?, used_count = 0, updated_at = ? WHERE user_id = ?"
        )
        .bind(period, nowIso(), userId)
        .run();
      return { user_id: userId, period, used_count: 0, updated_at: nowIso() };
    }
    return row;
  }
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO conversion_quotas (user_id, period, used_count, updated_at) VALUES (?, ?, 0, ?)"
    )
    .bind(userId, period, now)
    .run();
  return { user_id: userId, period, used_count: 0, updated_at: now };
}

export async function incrementQuota(db: D1Database, userId: string): Promise<void> {
  const quota = await getOrCreateQuota(db, userId);
  await db
    .prepare("UPDATE conversion_quotas SET used_count = ?, updated_at = ? WHERE user_id = ?")
    .bind(quota.used_count + 1, nowIso(), userId)
    .run();
}

export async function listConversionQuotas(db: D1Database): Promise<ConversionQuota[]> {
  const { results } = await db
    .prepare("SELECT * FROM conversion_quotas ORDER BY updated_at DESC")
    .all<ConversionQuota>();
  return results ?? [];
}

export function detectFormat(filename: string): FileFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ifc":
      return "ifc";
    case "dxf":
      return "dxf";
    case "dwg":
      return "dwg";
    case "jww":
      return "jww";
    default:
      return "unknown";
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
