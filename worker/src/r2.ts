import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";

export type R2Env = {
  BUCKET: R2Bucket;
};

export function makeObjectKey(userId: string, fileId: string, filename: string): string {
  return `uploads/${userId}/${fileId}/${filename}`;
}

export function makeFragmentsKey(fileId: string): string {
  return `fragments/${fileId}/model.frag`;
}

export async function putObject(
  bucket: R2Bucket,
  key: string,
  data: ReadableStream | ArrayBuffer | Blob | string,
  metadata: Record<string, string>,
  httpMetadata?: { contentType?: string; contentDisposition?: string }
): Promise<void> {
  await bucket.put(key, data, {
    customMetadata: metadata,
    httpMetadata,
  });
}

export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function objectExists(bucket: R2Bucket, key: string): Promise<boolean> {
  const obj = await bucket.head(key);
  return obj !== null;
}
