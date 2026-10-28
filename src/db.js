// SQLite storage using Node's built-in node:sqlite (no native npm module needed).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      zone TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      ages_json TEXT NOT NULL,
      prices_json TEXT NOT NULL      -- price snapshot, so later config changes don't alter a quote
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quotes(id),
      plan TEXT NOT NULL,
      status TEXT NOT NULL,          -- plan_selected | details_set | reviewed | paid
      total_cents INTEGER NOT NULL,
      policyholder_json TEXT,
      travelers_json TEXT,
      review_token_hash TEXT,
      review_total_cents INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policies (
      policy_number TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
      issued_at TEXT NOT NULL,
      pdf_token TEXT NOT NULL UNIQUE,
      email_status TEXT NOT NULL,    -- not_configured | pending | sent | failed
      email_error TEXT,
      email_updated_at TEXT
    );
  `);

  // Added later: Brevo delivery tracking. ALTER keeps existing databases and their data.
  const existing = new Set(db.prepare('PRAGMA table_info(policies)').all().map(c => c.name));
  for (const [column, type] of [
    ['email_message_id', 'TEXT'],          // Brevo messageId, used to look up delivery events
    ['email_delivery_json', 'TEXT'],       // last summarised Brevo status { status, event, at, reason }
    ['email_checked_at', 'TEXT'],          // when we last asked Brevo
  ]) {
    if (!existing.has(column)) db.exec(`ALTER TABLE policies ADD COLUMN ${column} ${type}`);
  }
  return db;
}
