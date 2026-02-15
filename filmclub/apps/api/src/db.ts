import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";

const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
const envFile = envCandidates.find((candidate) => existsSync(candidate));
if (envFile) {
  config({ path: envFile });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Create filmclub/.env from .env.example.");
}

export const pool = new Pool({
  connectionString: databaseUrl
});

export const runMigrations = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      display_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE sessions
    SET expires_at = created_at + INTERVAL '30 days'
    WHERE expires_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE sessions
    ALTER COLUMN expires_at SET NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clubs (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      approval_mode TEXT NOT NULL CHECK (approval_mode IN ('unanimous', 'majority', 'fixed')),
      required_approvals INTEGER,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS club_memberships (
      id UUID PRIMARY KEY,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      joined_at TIMESTAMPTZ NOT NULL,
      UNIQUE (club_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS proposed_changes (
      id UUID PRIMARY KEY,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      entity TEXT NOT NULL CHECK (entity IN ('movie_watch', 'food_order', 'attendance', 'debt_settlement')),
      payload JSONB NOT NULL,
      proposer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL,
      resolved_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS change_votes (
      id UUID PRIMARY KEY,
      proposed_change_id UUID NOT NULL REFERENCES proposed_changes(id) ON DELETE CASCADE,
      voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (proposed_change_id, voter_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS committed_change_logs (
      id UUID PRIMARY KEY,
      proposed_change_id UUID NOT NULL UNIQUE REFERENCES proposed_changes(id) ON DELETE CASCADE,
      committed_at TIMESTAMPTZ NOT NULL,
      committed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_orders (
      id UUID PRIMARY KEY,
      proposed_change_id UUID UNIQUE REFERENCES proposed_changes(id) ON DELETE SET NULL,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      vendor TEXT NOT NULL,
      total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0),
      currency TEXT NOT NULL,
      payer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    ALTER TABLE food_orders
    ADD COLUMN IF NOT EXISTS proposed_change_id UUID UNIQUE REFERENCES proposed_changes(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_order_participants (
      food_order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      PRIMARY KEY (food_order_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY,
      club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      food_order_id UUID REFERENCES food_orders(id) ON DELETE SET NULL,
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
};
