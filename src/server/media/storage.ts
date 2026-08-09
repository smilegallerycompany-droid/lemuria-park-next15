/**
 * Media storage abstraction — never store base64 blobs in DB.
 * Development: LocalMediaStorage under /public/uploads
 * Production: YandexObjectStorage when credentials present; otherwise NOT_CONFIGURED.
 */

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

/** Yandex Object Storage adapter — credentials required in production. */
export class YandexObjectStorage implements MediaStorage {
  constructor(
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  status(): MediaStorageStatus {
    return "OK";
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async upload(): Promise<StoredMedia> {
    throw new Error("Yandex Object Storage adapter is not wired — credentials present but SDK not configured");
  }

  async delete(): Promise<void> {
    throw new Error("Yandex Object Storage adapter is not wired");
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
  const bucket = process.env.YANDEX_STORAGE_BUCKET;
  const publicBase = process.env.YANDEX_STORAGE_PUBLIC_URL;
  const hasCreds = Boolean(
    bucket && publicBase && process.env.YANDEX_STORAGE_ACCESS_KEY && process.env.YANDEX_STORAGE_SECRET_KEY,
  );

  if (process.env.NODE_ENV === "production") {
    if (hasCreds) {
      return new YandexObjectStorage(bucket!, publicBase!);
    }
    return new NotConfiguredMediaStorage();
  }

  return new LocalMediaStorage();
}

export function getMediaStorageStatus(): MediaStorageStatus {
  return getMediaStorage().status();
}
