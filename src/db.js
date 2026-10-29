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
    ['snapshot_json', 'TEXT'],             // what was sold: trip, plan limits, excess, exclusions, prices
  ]) {
    if (!existing.has(column)) db.exec(`ALTER TABLE policies ADD COLUMN ${column} ${type}`);
  }

  // The exact summary the customer reviewed and accepted; becomes the policy snapshot on payment.
  const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map(c => c.name));
  if (!orderColumns.has('review_snapshot_json')) db.exec('ALTER TABLE orders ADD COLUMN review_snapshot_json TEXT');
  // Stripe (test mode): the order's single PaymentIntent, reused so an order is never charged twice.
  if (!orderColumns.has('payment_intent_id')) db.exec('ALTER TABLE orders ADD COLUMN payment_intent_id TEXT');
  // DNI/NIE given with the traveller details; moved to the policy (and cleared here) when the policy is issued.
  if (!orderColumns.has('holder_id_number')) db.exec('ALTER TABLE orders ADD COLUMN holder_id_number TEXT');
  if (!existing.has('payment_ref')) db.exec('ALTER TABLE policies ADD COLUMN payment_ref TEXT'); // pi_… or NULL (simulated)
  // Success step: the buyer's browser gets a private token to resend or forward the policy email (hash stored, never the token).
  if (!existing.has('manage_token_hash')) db.exec('ALTER TABLE policies ADD COLUMN manage_token_hash TEXT');
  // Policyholder DNI/NIE: kept ONLY here (never in events, logs or snapshots, which hold the masked form).
  // NULL id_status = policy sold before this feature (treated as active). pending_id → the holder completes it with a one-time link.
  for (const [column, type] of [['holder_id_number', 'TEXT'], ['id_status', 'TEXT'], ['id_token_hash', 'TEXT']]) {
    if (!existing.has(column)) db.exec(`ALTER TABLE policies ADD COLUMN ${column} ${type}`);
  }

  // Every resend / forward of a policy email (max 5 per policy). Only the masked address is kept (l***@gmail.com).
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_number TEXT NOT NULL REFERENCES policies(policy_number),
      kind TEXT NOT NULL,            -- resend | forward
      to_masked TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL,          -- sent | failed
      error TEXT,
      message_id TEXT,               -- Brevo messageId, to read delivery events
      delivery_json TEXT,
      checked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS policy_sends_policy ON policy_sends(policy_number);
  `);

  // Plans were renamed (esencial → wild, premium → wild_plus). Safe to run every start.
  const RENAMED = { esencial: 'wild', premium: 'wild_plus' };
  for (const [from, to] of Object.entries(RENAMED)) {
    db.prepare('UPDATE orders SET plan = ? WHERE plan = ?').run(to, from);
  }
  for (const q of db.prepare(`SELECT id, prices_json FROM quotes WHERE prices_json LIKE '%"esencial"%' OR prices_json LIKE '%"premium"%'`).all()) {
    const prices = JSON.parse(q.prices_json);
    for (const [from, to] of Object.entries(RENAMED)) {
      if (from in prices) { prices[to] = prices[from]; delete prices[from]; }
    }
    db.prepare('UPDATE quotes SET prices_json = ? WHERE id = ?').run(JSON.stringify(prices), q.id);
  }
  return db;
}
