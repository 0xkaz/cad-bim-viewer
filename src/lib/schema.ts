import { z } from "zod";

export const UserSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  is_admin: z.boolean(),
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
  format: z.enum(["ifc", "dxf", "dwg", "jww", "unknown"]),
  r2_key: z.string(),
  r2_bucket: z.string(),
  fragments_r2_key: z.string().nullable(),
  fragments_size_bytes: z.number().nullable(),
  fragments_created_at: z.string().nullable(),
  is_public: z.number(),
  is_deleted: z.number(),
  deleted_at: z.string().nullable(),
  delete_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FileRecord = z.infer<typeof FileRecordSchema>;

export const AuditLogSchema = z.object({
  id: z.number(),
  actor_id: z.string(),
  actor_email: z.string(),
  action: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  details: z.record(z.unknown()).nullable(),
  created_at: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const ShareTokenSchema = z.object({
  id: z.string(),
  file_id: z.string(),
  token: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  created_by: z.string(),
});

export type ShareToken = z.infer<typeof ShareTokenSchema>;

export const ConversionStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export type ConversionStatus = z.infer<typeof ConversionStatusSchema>;

export const ConversionFormatSchema = z.enum(["ifc", "dxf", "dwg"]);

export type ConversionFormat = z.infer<typeof ConversionFormatSchema>;

export const ConversionSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  source_file_id: z.string(),
  source_format: z.enum(["ifc", "dxf", "dwg", "jww", "unknown"]),
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
