/**
 * Minimal AWS Signature V4 signer for S3-compatible Yandex Object Storage.
 * No secrets leave the server; never exposed to the client.
 */
import { createHash, createHmac } from "node:crypto";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hashHex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function signS3Request(params: {
  method: string;
  endpointHost: string;
  path: string;
  region: string;
  accessKey: string;
  secretKey: string;
  payload: Buffer;
  contentType?: string;
  amzDate?: Date;
}): { headers: Record<string, string> } {
  const now = params.amzDate ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hashHex(params.payload);
  const contentType = params.contentType ?? "application/octet-stream";

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${params.endpointHost}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    params.method,
    params.path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${params.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    headers: {
      "Content-Type": contentType,
      Host: params.endpointHost,
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}
