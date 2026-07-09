import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { TokenPayload } from "./auth";

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  WORKER_JWT_SECRET: string;
  FRONTEND_URL: string;
  ADMIN_EMAIL: string;
  CONVERTER_URL?: string;
  JWW_CONVERTER_URL?: string;
};

type Variables = {
  user: TokenPayload;
};

export type Env = {
  Bindings: Bindings;
  Variables: Variables;
};
