import type { User } from "./schema";

export function saveToken(token: string): void {
  localStorage.setItem("token", token);
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function removeToken(): void {
  localStorage.removeItem("token");
}

export function parseJwt(token: string): User | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string | null) ?? null,
      picture: (payload.picture as string | null) ?? null,
      is_admin: payload.is_admin === true,
      created_at: (payload.iat ? new Date(payload.iat * 1000).toISOString() : "") as string,
    };
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  const token = getToken();
  if (!token) return null;
  return parseJwt(token);
}
