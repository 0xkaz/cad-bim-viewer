import type { D1Database } from "@cloudflare/workers-types";
import { type AuditAction, type AuditTargetType, insertAuditLog } from "./db";

export async function logAction(
  db: D1Database,
  actor: { id: string; email: string },
  action: AuditAction,
  targetType: AuditTargetType,
  targetId: string,
  details?: Record<string, unknown>
): Promise<void> {
  await insertAuditLog(db, {
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}
