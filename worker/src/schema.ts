import { z } from "zod";

export const FileFormatSchema = z.enum(["ifc", "dxf", "dwg", "jww", "unknown"]);
export type FileFormat = z.infer<typeof FileFormatSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  is_admin: z.number().default(0),
  created_at: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export const FileRecordSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  filename: z.string(),
  original_name: z.string(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().nullable(),
  format: FileFormatSchema,
  r2_key: z.string(),
  r2_bucket: z.string(),
  fragments_r2_key: z.string().nullable(),
  fragments_size_bytes: z.number().nullable(),
  fragments_created_at: z.string().nullable(),
  is_public: z.number().default(0),
  is_deleted: z.number().default(0),
  deleted_at: z.string().nullable(),
  delete_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FileRecord = z.infer<typeof FileRecordSchema>;

export const ConversionStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export type ConversionStatus = z.infer<typeof ConversionStatusSchema>;

export const ConversionFormatSchema = z.enum(["ifc", "dxf", "dwg"]);

export type ConversionFormat = z.infer<typeof ConversionFormatSchema>;

export const ConversionSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  source_file_id: z.string(),
  source_format: FileFormatSchema,
  target_format: ConversionFormatSchema,
  target_file_id: z.string().nullable(),
  status: ConversionStatusSchema,
  provider: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Conversion = z.infer<typeof ConversionSchema>;

export const ConversionQuotaSchema = z.object({
  user_id: z.string(),
  period: z.string(),
  used_count: z.number(),
  updated_at: z.string(),
});

export type ConversionQuota = z.infer<typeof ConversionQuotaSchema>;

export const CreateConversionSchema = z.object({
  target_format: ConversionFormatSchema,
});

export type CreateConversion = z.infer<typeof CreateConversionSchema>;

export const AuditActionSchema = z.enum([
  "upload",
  "delete",
  "restore",
  "share",
  "revoke_share",
  "publish",
  "unpublish",
  "convert",
  "login",
  "admin_view",
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditTargetTypeSchema = z.enum(["file", "user", "share_token"]);

export type AuditTargetType = z.infer<typeof AuditTargetTypeSchema>;

export const UpdateFileSchema = z.object({
  is_public: z.boolean().optional(),
});

export const DeleteFileSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const CreateShareSchema = z.object({
  expires_in_hours: z.number().int().min(1).max(720).optional(),
});
