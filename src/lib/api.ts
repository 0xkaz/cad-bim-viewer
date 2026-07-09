import type { AuditLog, Conversion, ConversionQuota, FileRecord, ShareToken, User } from "./schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getConfig(): Promise<{
  conversion_enabled: boolean;
  jww_enabled: boolean;
}> {
  return fetchJson("/config");
}

export async function getAuthUrl(): Promise<{ url: string }> {
  return fetchJson("/auth/google");
}

export async function getMe(): Promise<{ user: User }> {
  return fetchJson("/auth/me");
}

export async function listFiles(): Promise<{ files: FileRecord[] }> {
  return fetchJson("/files");
}

export async function getFile(id: string): Promise<{ file: FileRecord }> {
  return fetchJson(`/files/${id}`);
}

export async function uploadFile(file: File): Promise<{ file: FileRecord }> {
  const formData = new FormData();
  formData.append("file", file);
  return fetchJson("/files", {
    method: "POST",
    body: formData,
  });
}

export async function updateFileVisibility(
  id: string,
  isPublic: boolean
): Promise<{ file: FileRecord }> {
  return fetchJson(`/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_public: isPublic }),
  });
}

export async function deleteFile(id: string, reason: string): Promise<{ success: boolean }> {
  return fetchJson(`/files/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function createShare(
  fileId: string,
  expiresInHours?: number
): Promise<{ token: string; expires_at: string | null; share_url: string }> {
  return fetchJson(`/share/files/${fileId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expiresInHours ? { expires_in_hours: expiresInHours } : {}),
  });
}

export async function listShares(fileId: string): Promise<{ tokens: ShareToken[] }> {
  return fetchJson(`/share/files/${fileId}`);
}

export async function revokeShare(fileId: string, token: string): Promise<{ success: boolean }> {
  return fetchJson(`/share/files/${fileId}/${token}`, {
    method: "DELETE",
  });
}

export async function downloadFile(id: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/files/${id}/download`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to download file");
  return res.arrayBuffer();
}

export async function getFragmentsStatus(id: string): Promise<{
  has_fragments: boolean;
  fragments_r2_key: string | null;
  fragments_size_bytes: number | null;
  fragments_created_at: string | null;
}> {
  return fetchJson(`/files/${id}/fragments`);
}

export async function downloadFragments(id: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/files/${id}/fragments/download`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to download fragments");
  return res.arrayBuffer();
}

export async function uploadFragments(id: string, blob: Blob): Promise<{ file: FileRecord }> {
  const formData = new FormData();
  formData.append("file", blob, "model.frag");
  return fetchJson(`/files/${id}/fragments`, {
    method: "POST",
    body: formData,
  });
}

export async function getShare(token: string): Promise<{ share: ShareToken; file: FileRecord }> {
  return fetchJson(`/share/${token}`);
}

export async function downloadSharedFile(token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/share/${token}/download`);
  if (!res.ok) throw new Error("Failed to download shared file");
  return res.arrayBuffer();
}

export async function getSharedFragmentsStatus(token: string): Promise<{
  has_fragments: boolean;
  fragments_r2_key: string | null;
  fragments_size_bytes: number | null;
  fragments_created_at: string | null;
}> {
  return fetchJson(`/share/${token}/fragments`);
}

export async function downloadSharedFragments(token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/share/${token}/fragments/download`);
  if (!res.ok) throw new Error("Failed to download shared fragments");
  return res.arrayBuffer();
}

export async function adminListFiles(): Promise<{ files: FileRecord[] }> {
  return fetchJson("/admin/files");
}

export async function adminListUsers(): Promise<{ users: User[] }> {
  return fetchJson("/admin/users");
}

export async function adminListAudit(limit = 1000, offset = 0): Promise<{ logs: AuditLog[] }> {
  return fetchJson(`/admin/audit?limit=${limit}&offset=${offset}`);
}

export async function createConversion(
  fileId: string,
  targetFormat: "dxf" | "dwg" | "ifc"
): Promise<{ conversion: Conversion }> {
  return fetchJson(`/files/${fileId}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_format: targetFormat }),
  });
}

export async function getConversion(id: string): Promise<{ conversion: Conversion }> {
  return fetchJson(`/conversions/${id}`);
}

export async function listFileConversions(fileId: string): Promise<{ conversions: Conversion[] }> {
  return fetchJson(`/files/${fileId}/conversions`);
}

export async function adminListConversions(
  limit = 1000,
  offset = 0
): Promise<{ conversions: Conversion[] }> {
  return fetchJson(`/admin/conversions?limit=${limit}&offset=${offset}`);
}

export async function adminListConversionQuotas(): Promise<{ quotas: ConversionQuota[] }> {
  return fetchJson("/admin/conversion-quotas");
}
