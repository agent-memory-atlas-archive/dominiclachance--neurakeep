import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const magic = Buffer.from("NKENC1\n", "ascii");

export type EncryptionPurpose = "space-key-recovery" | "agent-grant" | "raw" | "wiki" | "state" | "backup";

export interface EncryptionContext {
  tenantId: string;
  spaceId: string;
  purpose: EncryptionPurpose;
  keyVersion: number;
  path?: string;
}

interface EnvelopeHeader extends EncryptionContext {
  algorithm: "aes-256-gcm";
  nonce: string;
  tag: string;
}

export function derivePurposeKey(key: Buffer, context: EncryptionContext, salt = Buffer.alloc(0)): Buffer {
  assertKey(key);
  return Buffer.from(hkdfSync("sha256", key, salt, contextBytes(context), 32));
}

export function encryptEnvelope(plaintext: Buffer, key: Buffer, context: EncryptionContext, salt = Buffer.alloc(0)): Buffer {
  const derived = derivePurposeKey(key, context, salt);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derived, nonce);
  const aad = contextBytes(context);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const header: EnvelopeHeader = {
    ...context,
    algorithm: "aes-256-gcm",
    nonce: nonce.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url")
  };
  derived.fill(0);
  const encodedHeader = Buffer.from(JSON.stringify(header), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(encodedHeader.length);
  return Buffer.concat([magic, length, encodedHeader, ciphertext]);
}

export function decryptEnvelope(envelope: Buffer, key: Buffer, expected: EncryptionContext, salt = Buffer.alloc(0)): Buffer {
  if (envelope.length < magic.length + 4 || !envelope.subarray(0, magic.length).equals(magic)) {
    throw new Error("Encrypted payload header is missing or invalid.");
  }
  const headerLength = envelope.readUInt32BE(magic.length);
  const headerStart = magic.length + 4;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > envelope.length) throw new Error("Encrypted payload header is truncated.");
  const header = JSON.parse(envelope.subarray(headerStart, headerEnd).toString("utf8")) as EnvelopeHeader;
  if (header.algorithm !== "aes-256-gcm" || contextBytes(header).compare(contextBytes(expected)) !== 0) {
    throw new Error("Encrypted payload context does not match this tenant, space, purpose, key version, or path.");
  }
  const derived = derivePurposeKey(key, expected, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", derived, Buffer.from(header.nonce, "base64url"));
    decipher.setAAD(contextBytes(expected));
    decipher.setAuthTag(Buffer.from(header.tag, "base64url"));
    return Buffer.concat([decipher.update(envelope.subarray(headerEnd)), decipher.final()]);
  } catch {
    throw new Error("Encrypted payload authentication failed.");
  } finally {
    derived.fill(0);
  }
}

export function isEncryptedEnvelope(value: Buffer): boolean {
  return value.length >= magic.length && value.subarray(0, magic.length).equals(magic);
}

function contextBytes(context: EncryptionContext): Buffer {
  return Buffer.from(JSON.stringify({
    tenantId: context.tenantId,
    spaceId: context.spaceId,
    purpose: context.purpose,
    keyVersion: context.keyVersion,
    path: context.path ?? ""
  }), "utf8");
}

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error("Encryption keys must contain exactly 32 bytes.");
}
