/**
 * Media storage abstraction — never store base64 blobs in DB.
 */
export type StoredMedia = {
  key: string;
  url: string;
  mimeType?: string;
  byteSize?: number;
};

export interface MediaStorage {
  put(params: {
    key: string;
    bytes: Buffer;
    mimeType?: string;
  }): Promise<StoredMedia>;
  delete?(key: string): Promise<void>;
}

/** Development-only: writes under /public/uploads */
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly publicDir = "public/uploads") {}

  async put(params: { key: string; bytes: Buffer; mimeType?: string }): Promise<StoredMedia> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const safe = params.key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const full = path.join(process.cwd(), this.publicDir, safe);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, params.bytes);
    return {
      key: safe,
      url: `/uploads/${safe}`,
      mimeType: params.mimeType,
      byteSize: params.bytes.byteLength,
    };
  }
}

/** Interface for Yandex Object Storage — wire credentials later. */
export class YandexObjectStorage implements MediaStorage {
  async put(): Promise<StoredMedia> {
    throw new Error("Yandex Object Storage is not configured");
  }
}

export function getMediaStorage(): MediaStorage {
  if (process.env.NODE_ENV === "production" && process.env.YANDEX_STORAGE_BUCKET) {
    return new YandexObjectStorage();
  }
  return new LocalMediaStorage();
}
