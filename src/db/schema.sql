PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO metadata (key, value)
VALUES ('schema_version', '2');

UPDATE metadata
SET value = '2'
WHERE key = 'schema_version';

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT,
  uri TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_time TEXT,
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'local_file',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  raw_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_content_hash
ON episodes(content_hash);

CREATE INDEX IF NOT EXISTS idx_episodes_space
ON episodes(space);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  episode_id TEXT REFERENCES episodes(id),
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_time TEXT,
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'local_file',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  raw_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_content_hash
ON sources(content_hash);

CREATE INDEX IF NOT EXISTS idx_sources_space
ON sources(space);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  heading TEXT,
  body TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  previous_section_id TEXT,
  next_section_id TEXT,
  token_estimate INTEGER,
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'local_file',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sections_source_id
ON sections(source_id);

CREATE INDEX IF NOT EXISTS idx_sections_space
ON sections(space);

CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
  heading,
  body,
  content='sections',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS sections_ai AFTER INSERT ON sections BEGIN
  INSERT INTO sections_fts(rowid, heading, body)
  VALUES (new.rowid, new.heading, new.body);
END;

CREATE TRIGGER IF NOT EXISTS sections_ad AFTER DELETE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, body)
  VALUES ('delete', old.rowid, old.heading, old.body);
END;

CREATE TRIGGER IF NOT EXISTS sections_au AFTER UPDATE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, body)
  VALUES ('delete', old.rowid, old.heading, old.body);
  INSERT INTO sections_fts(rowid, heading, body)
  VALUES (new.rowid, new.heading, new.body);
END;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  section_ids_json TEXT NOT NULL DEFAULT '[]',
  project TEXT,
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'agent',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  graph_subjects_json TEXT NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.8,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp
ON events(timestamp);

CREATE INDEX IF NOT EXISTS idx_events_project
ON events(project);

CREATE INDEX IF NOT EXISTS idx_events_space
ON events(space);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_ids_json TEXT NOT NULL,
  section_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  supersedes_json TEXT NOT NULL DEFAULT '[]',
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'agent',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  graph_subjects_json TEXT NOT NULL DEFAULT '[]',
  review_after TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_facts_subject
ON facts(subject);

CREATE INDEX IF NOT EXISTS idx_facts_predicate
ON facts(predicate);

CREATE INDEX IF NOT EXISTS idx_facts_space
ON facts(space);

CREATE TABLE IF NOT EXISTS failures (
  id TEXT PRIMARY KEY,
  project TEXT,
  attempted TEXT NOT NULL,
  failed_because TEXT NOT NULL,
  do_not_repeat TEXT NOT NULL,
  revisit_condition TEXT,
  source_ids_json TEXT NOT NULL,
  section_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'agent',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  graph_subjects_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.8,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_failures_project
ON failures(project);

CREATE INDEX IF NOT EXISTS idx_failures_space
ON failures(space);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  section_ids_json TEXT NOT NULL DEFAULT '[]',
  space TEXT NOT NULL DEFAULT 'personal',
  trust_level TEXT NOT NULL DEFAULT 'observed',
  source_origin TEXT NOT NULL DEFAULT 'agent',
  visibility TEXT NOT NULL DEFAULT 'private',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_status
ON proposals(status);

CREATE INDEX IF NOT EXISTS idx_proposals_space
ON proposals(space);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  query TEXT NOT NULL,
  expected_source_ids_json TEXT NOT NULL DEFAULT '[]',
  expected_section_ids_json TEXT NOT NULL DEFAULT '[]',
  expected_answer_contains_json TEXT NOT NULL DEFAULT '[]',
  space TEXT NOT NULL DEFAULT 'personal',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_space
ON eval_cases(space);

CREATE TABLE IF NOT EXISTS hosted_tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS hosted_spaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES hosted_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'personal',
  created_at TEXT NOT NULL,
  policy_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hosted_spaces_tenant
ON hosted_spaces(tenant_id);

CREATE TABLE IF NOT EXISTS hosted_memberships (
  tenant_id TEXT NOT NULL REFERENCES hosted_tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  roles_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS hosted_audit_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  actor_provider TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hosted_audit_tenant_created
ON hosted_audit_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS hosted_subscriptions (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hosted_subscriptions_customer
ON hosted_subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_hosted_subscriptions_email
ON hosted_subscriptions(email);

CREATE TABLE IF NOT EXISTS hosted_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_checkout',
  plan TEXT NOT NULL DEFAULT 'team',
  seat_count INTEGER NOT NULL DEFAULT 2,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  policy_json TEXT NOT NULL DEFAULT '{}',
  sso_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hosted_organizations_owner
ON hosted_organizations(owner_user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_hosted_organizations_customer
ON hosted_organizations(stripe_customer_id);

CREATE TABLE IF NOT EXISTS hosted_org_memberships (
  organization_id TEXT NOT NULL REFERENCES hosted_organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hosted_org_memberships_user
ON hosted_org_memberships(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS hosted_org_spaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES hosted_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_hosted_org_spaces_org
ON hosted_org_spaces(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS hosted_org_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES hosted_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  accepted_by TEXT,
  accepted_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hosted_org_invitations_org
ON hosted_org_invitations(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS hosted_org_scim_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES hosted_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS hosted_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL DEFAULT 'personal',
  user_id TEXT NOT NULL,
  email TEXT,
  name TEXT NOT NULL,
  roles_json TEXT NOT NULL DEFAULT '["mcp"]',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hosted_access_tokens_owner
ON hosted_access_tokens(tenant_id, user_id, created_at);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
