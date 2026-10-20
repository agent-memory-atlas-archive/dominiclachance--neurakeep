import { randomBytes } from "node:crypto";
import type { UmosDatabase } from "../db/client.js";
import { decryptEnvelope, encryptEnvelope } from "./encryption.js";
import type { RecoveryKeyProvider } from "./key-provider.js";

interface SpaceKeyRow { keyVersion: number; wrappedKey: Buffer; providerId: string; }

export interface ResolvedSpaceKey { key: Buffer; keyVersion: number; }

export function getOrCreateSpaceKey(db: UmosDatabase, tenantId: string, spaceId: string, provider: RecoveryKeyProvider): ResolvedSpaceKey {
  const existing = selectSpaceKey(db, tenantId, spaceId);
  if (existing) return unwrap(existing, tenantId, spaceId, provider);
  const key = randomBytes(32);
  const keyVersion = 1;
  const recoveryKey = provider.getKey();
  let created = false;
  try {
    const wrapped = encryptEnvelope(key, recoveryKey, { tenantId, spaceId, purpose: "space-key-recovery", keyVersion });
    db.prepare(`INSERT INTO hosted_space_keys
      (tenant_id, space_id, key_version, provider_id, wrapped_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`)
      .run(tenantId, spaceId, keyVersion, provider.id, wrapped, new Date().toISOString(), new Date().toISOString());
    created = true;
    return { key, keyVersion };
  } finally { recoveryKey.fill(0); if (!created) key.fill(0); }
}

export function recoverSpaceKey(db: UmosDatabase, tenantId: string, spaceId: string, provider: RecoveryKeyProvider): ResolvedSpaceKey {
  const row = selectSpaceKey(db, tenantId, spaceId);
  if (!row) throw new Error("No active encryption key exists for this hosted space.");
  return unwrap(row, tenantId, spaceId, provider);
}

export function rewrapAllSpaceKeys(db: UmosDatabase, oldProvider: RecoveryKeyProvider, nextProvider: RecoveryKeyProvider): number {
  const rows = db.prepare(`SELECT tenant_id AS tenantId, space_id AS spaceId, key_version AS keyVersion,
    wrapped_key AS wrappedKey, provider_id AS providerId FROM hosted_space_keys WHERE status = 'active'`).all() as Array<SpaceKeyRow & { tenantId: string; spaceId: string }>;
  const transaction = db.transaction(() => {
    for (const row of rows) {
      const resolved = unwrap(row, row.tenantId, row.spaceId, oldProvider);
      const nextRecoveryKey = nextProvider.getKey();
      try {
        const wrapped = encryptEnvelope(resolved.key, nextRecoveryKey, { tenantId: row.tenantId, spaceId: row.spaceId, purpose: "space-key-recovery", keyVersion: row.keyVersion });
        db.prepare("UPDATE hosted_space_keys SET provider_id = ?, wrapped_key = ?, updated_at = ? WHERE tenant_id = ? AND space_id = ?")
          .run(nextProvider.id, wrapped, new Date().toISOString(), row.tenantId, row.spaceId);
      } finally { resolved.key.fill(0); nextRecoveryKey.fill(0); }
    }
  });
  transaction();
  return rows.length;
}

function selectSpaceKey(db: UmosDatabase, tenantId: string, spaceId: string): SpaceKeyRow | undefined {
  return db.prepare(`SELECT key_version AS keyVersion, wrapped_key AS wrappedKey, provider_id AS providerId
    FROM hosted_space_keys WHERE tenant_id = ? AND space_id = ? AND status = 'active'`)
    .get(tenantId, spaceId) as SpaceKeyRow | undefined;
}

function unwrap(row: SpaceKeyRow, tenantId: string, spaceId: string, provider: RecoveryKeyProvider): ResolvedSpaceKey {
  if (row.providerId !== provider.id) throw new Error("The configured recovery key provider does not match this hosted space.");
  const recoveryKey = provider.getKey();
  try {
    return { key: decryptEnvelope(row.wrappedKey, recoveryKey, { tenantId, spaceId, purpose: "space-key-recovery", keyVersion: row.keyVersion }), keyVersion: row.keyVersion };
  } finally { recoveryKey.fill(0); }
}
