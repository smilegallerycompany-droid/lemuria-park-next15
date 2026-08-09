/**
 * Media storage abstraction — never store base64 blobs in DB.
 */
import { signS3Request } from "@/server/media/s3-sign";

export type StoredMedia = {
  key: string;
  url: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
};

export type MediaStorageStatus = "OK" | "NOT_CONFIGURED" | "LOCAL_DEV";

export interface MediaStorage {
  upload(params: {
    key: string;
    bytes: Buffer;
    mimeType?: string;
  }): Promise<StoredMedia>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  status(): MediaStorageStatus;
}

export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const DEFAULT_MAX_UPLOAD_BYTES = Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);

export function assertAllowedImageUpload(params: { mimeType: string; byteSize: number }) {
  if (!ALLOWED_IMAGE_MIME.has(params.mimeType)) {
    throw new Error("Разрешены только JPEG, PNG, WEBP");
  }
  if (params.byteSize > DEFAULT_MAX_UPLOAD_BYTES) {
    throw new Error(`Файл больше лимита ${DEFAULT_MAX_UPLOAD_BYTES} байт`);
  }
}

/** Development-only: writes under /public/uploads */
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly publicDir = "public/uploads") {}

  status(): MediaStorageStatus {
    return "LOCAL_DEV";
  }

  getPublicUrl(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    return `/uploads/${safe}`;
  }

  async upload(params: {
    key: string;
    bytes: Buffer;
    mimeType?: string;
  }): Promise<StoredMedia> {
    if (params.mimeType) {
      assertAllowedImageUpload({ mimeType: params.mimeType, byteSize: params.bytes.byteLength });
    }
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const safe = params.key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const full = path.join(process.cwd(), this.publicDir, safe);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, params.bytes);
    return {
      key: safe,
      url: this.getPublicUrl(safe),
      mimeType: params.mimeType,
      byteSize: params.bytes.byteLength,
    };
  }

  async delete(key: string): Promise<void> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const full = path.join(process.cwd(), this.publicDir, safe);
    await fs.unlink(full).catch(() => undefined);
  }
}

/** Production Yandex Object Storage (S3-compatible). */
export class YandexObjectStorage implements MediaStorage {
  constructor(
    private readonly opts: {
      endpoint: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      publicBaseUrl: string;
      region?: string;
    },
  ) {}

  status(): MediaStorageStatus {
    return "OK";
  }

  getPublicUrl(key: string): string {
    return `${this.opts.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  private endpointHost(): string {
    return this.opts.endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  async upload(params: {
    key: string;
    bytes: Buffer;
    mimeType?: string;
  }): Promise<StoredMedia> {
    if (params.mimeType) {
      assertAllowedImageUpload({ mimeType: params.mimeType, byteSize: params.bytes.byteLength });
    }
    const host = this.endpointHost();
    const path = `/${this.opts.bucket}/${params.key}`;
    const { headers } = signS3Request({
      method: "PUT",
      endpointHost: host,
      path,
      region: this.opts.region ?? "ru-central1",
      accessKey: this.opts.accessKey,
      secretKey: this.opts.secretKey,
      payload: params.bytes,
      contentType: params.mimeType,
    });

    const res = await fetch(`https://${host}${path}`, {
      method: "PUT",
      headers,
      body: new Uint8Array(params.bytes),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Yandex storage upload failed (${res.status}): ${text.slice(0, 200)}`);
    }

    return {
      key: params.key,
      url: this.getPublicUrl(params.key),
      mimeType: params.mimeType,
      byteSize: params.bytes.byteLength,
    };
  }

  async delete(key: string): Promise<void> {
    const host = this.endpointHost();
    const path = `/${this.opts.bucket}/${key}`;
    const empty = Buffer.alloc(0);
    const { headers } = signS3Request({
      method: "DELETE",
      endpointHost: host,
      path,
      region: this.opts.region ?? "ru-central1",
      accessKey: this.opts.accessKey,
      secretKey: this.opts.secretKey,
      payload: empty,
    });
    await fetch(`https://${host}${path}`, { method: "DELETE", headers });
  }
}

export class NotConfiguredMediaStorage implements MediaStorage {
  status(): MediaStorageStatus {
    return "NOT_CONFIGURED";
  }

  getPublicUrl(): string {
    throw new Error("Media storage is not configured");
  }

  async upload(): Promise<StoredMedia> {
    throw new Error("Media storage is not configured");
  }

  async delete(): Promise<void> {
    throw new Error("Media storage is not configured");
  }
}

export function getMediaStorage(): MediaStorage {
  const endpoint = process.env.YANDEX_STORAGE_ENDPOINT;
  const bucket = process.env.YANDEX_STORAGE_BUCKET;
  const publicBase =
    process.env.YANDEX_STORAGE_PUBLIC_BASE_URL || process.env.YANDEX_STORAGE_PUBLIC_URL;
  const accessKey = process.env.YANDEX_STORAGE_ACCESS_KEY;
  const secretKey = process.env.YANDEX_STORAGE_SECRET_KEY;
  const hasCreds = Boolean(endpoint && bucket && publicBase && accessKey && secretKey);

  if (hasCreds) {
    return new YandexObjectStorage({
      endpoint: endpoint!,
      bucket: bucket!,
      accessKey: accessKey!,
      secretKey: secretKey!,
      publicBaseUrl: publicBase!,
    });
  }

  if (process.env.NODE_ENV === "production") {
    return new NotConfiguredMediaStorage();
  }

  return new LocalMediaStorage();
}

export function getMediaStorageStatus(): MediaStorageStatus {
  return getMediaStorage().status();
}

/** Soft-archive preferred: only hard-delete storage object when no remaining refs. */
export async function canPhysicallyDeleteMedia(
  mediaObjectId: string,
  countRefs: (mediaObjectId: string) => Promise<number>,
): Promise<boolean> {
  const refs = await countRefs(mediaObjectId);
  return refs === 0;
}
