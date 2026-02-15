import { randomUUID } from "node:crypto";
import type {
  MeetingCompletePayload,
  MeetingSchedulePayload,
  MeetingStartPayload,
  MeetingUpdatePayload
} from "@filmclub/shared";
import type { PoolClient } from "pg";
import { pool } from "./db.js";

interface DbMeetingRow {
  id: string;
  club_id: string;
  title: string | null;
  scheduled_date: string;
  status: "scheduled" | "active" | "completed";
  started_at: string | null;
  completed_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

const mapMeeting = (row: DbMeetingRow) => ({
  id: row.id,
  clubId: row.club_id,
  title: row.title ?? undefined,
  scheduledDate: row.scheduled_date,
  status: row.status,
  startedAt: row.started_at ?? undefined,
  completedAt: row.completed_at ?? undefined,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getClubTimezoneTx = async (client: PoolClient, clubId: string) => {
  const result = await client.query<{ timezone: string }>(`SELECT timezone FROM clubs WHERE id = $1`, [clubId]);
  return result.rows[0]?.timezone ?? "Europe/Berlin";
};

const todayInTimezone = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );

export const maybeAutoStartMeetingTx = async (client: PoolClient, clubId: string) => {
  const active = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings WHERE club_id = $1 AND status = 'active'`,
    [clubId]
  );
  if (Number(active.rows[0]?.count ?? "0") > 0) {
    return;
  }
  const timezone = await getClubTimezoneTx(client, clubId);
  const today = todayInTimezone(timezone);
  const dueMeeting = await client.query<DbMeetingRow>(
    `
    SELECT id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    FROM meetings
    WHERE club_id = $1 AND status = 'scheduled' AND scheduled_date <= $2::date
    ORDER BY scheduled_date ASC, created_at ASC
    LIMIT 1
    FOR UPDATE
    `,
    [clubId, today]
  );
  const row = dueMeeting.rows[0];
  if (!row) {
    return;
  }
  const nowIso = new Date().toISOString();
  await client.query(
    `
    UPDATE meetings
    SET status = 'active', started_at = COALESCE(started_at, $2), updated_at = $2
    WHERE id = $1
    `,
    [row.id, nowIso]
  );
};

const getMeetingByIdTx = async (client: PoolClient, meetingId: string) => {
  const result = await client.query<DbMeetingRow>(
    `
    SELECT id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    FROM meetings
    WHERE id = $1
    FOR UPDATE
    `,
    [meetingId]
  );
  return result.rows[0] ? mapMeeting(result.rows[0]) : null;
};

export const listMeetingsForClub = async (clubId: string) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await maybeAutoStartMeetingTx(client, clubId);
    const result = await client.query<DbMeetingRow>(
      `
      SELECT id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
      FROM meetings
      WHERE club_id = $1
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
        scheduled_date ASC,
        created_at ASC
      `,
      [clubId]
    );
    await client.query("COMMIT");
    return result.rows.map(mapMeeting);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getMeetingById = async (meetingId: string) => {
  const result = await pool.query<DbMeetingRow>(
    `
    SELECT id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    FROM meetings
    WHERE id = $1
    `,
    [meetingId]
  );
  return result.rows[0] ? mapMeeting(result.rows[0]) : null;
};

export const hasMeetingsForClub = async (clubId: string) => {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings WHERE club_id = $1`,
    [clubId]
  );
  return Number(result.rows[0]?.count ?? "0") > 0;
};

export const validateMeetingEditableForRecords = async (clubId: string, meetingId: string) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await maybeAutoStartMeetingTx(client, clubId);
    const meeting = await getMeetingByIdTx(client, meetingId);
    if (!meeting || meeting.clubId !== clubId) {
      await client.query("ROLLBACK");
      return { error: "meeting_not_found" as const };
    }
    if (meeting.status === "scheduled") {
      await client.query("ROLLBACK");
      return { error: "meeting_not_started" as const };
    }
    await client.query("COMMIT");
    return { data: meeting };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const applyMeetingScheduleProposal = async (
  client: PoolClient,
  params: { clubId: string; proposerUserId: string; payload: unknown }
) => {
  const payload = params.payload as MeetingSchedulePayload;
  const createdAt = new Date().toISOString();
  const result = await client.query<DbMeetingRow>(
    `
    INSERT INTO meetings (
      id, club_id, title, scheduled_date, status, created_by_user_id, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4::date, 'scheduled', $5, $6, $6)
    RETURNING id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    `,
    [randomUUID(), params.clubId, payload.title?.trim() || null, payload.scheduledDate, params.proposerUserId, createdAt]
  );
  return { data: mapMeeting(result.rows[0]) };
};

export const applyMeetingUpdateProposal = async (client: PoolClient, params: { clubId: string; payload: unknown }) => {
  const payload = params.payload as MeetingUpdatePayload;
  const meeting = await getMeetingByIdTx(client, payload.meetingId);
  if (!meeting || meeting.clubId !== params.clubId) {
    return { error: "meeting_not_found" as const };
  }
  const updatedAt = new Date().toISOString();
  const result = await client.query<DbMeetingRow>(
    `
    UPDATE meetings
    SET
      title = CASE WHEN $2::text IS NULL THEN title ELSE $2 END,
      scheduled_date = CASE WHEN $3::date IS NULL THEN scheduled_date ELSE $3 END,
      updated_at = $4
    WHERE id = $1
    RETURNING id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    `,
    [meeting.id, payload.title === undefined ? null : payload.title.trim(), payload.scheduledDate ?? null, updatedAt]
  );
  return { data: mapMeeting(result.rows[0]) };
};

export const applyMeetingStartProposal = async (client: PoolClient, params: { clubId: string; payload: unknown }) => {
  const payload = params.payload as MeetingStartPayload;
  const meeting = await getMeetingByIdTx(client, payload.meetingId);
  if (!meeting || meeting.clubId !== params.clubId) {
    return { error: "meeting_not_found" as const };
  }
  if (meeting.status === "completed") {
    return { error: "meeting_already_completed" as const };
  }
  if (meeting.status === "active") {
    return { data: meeting };
  }
  const active = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM meetings WHERE club_id = $1 AND status = 'active' AND id <> $2`,
    [params.clubId, meeting.id]
  );
  if (Number(active.rows[0]?.count ?? "0") > 0) {
    return { error: "another_meeting_active" as const };
  }
  const updatedAt = new Date().toISOString();
  const result = await client.query<DbMeetingRow>(
    `
    UPDATE meetings
    SET status = 'active', started_at = COALESCE(started_at, $2), updated_at = $2
    WHERE id = $1
    RETURNING id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    `,
    [meeting.id, updatedAt]
  );
  return { data: mapMeeting(result.rows[0]) };
};

export const applyMeetingCompleteProposal = async (client: PoolClient, params: { clubId: string; payload: unknown }) => {
  const payload = params.payload as MeetingCompletePayload;
  const meeting = await getMeetingByIdTx(client, payload.meetingId);
  if (!meeting || meeting.clubId !== params.clubId) {
    return { error: "meeting_not_found" as const };
  }
  if (meeting.status !== "active") {
    return { error: "meeting_not_active" as const };
  }
  const updatedAt = new Date().toISOString();
  const result = await client.query<DbMeetingRow>(
    `
    UPDATE meetings
    SET status = 'completed', completed_at = COALESCE(completed_at, $2), updated_at = $2
    WHERE id = $1
    RETURNING id, club_id, title, scheduled_date::text, status, started_at, completed_at, created_by_user_id, created_at, updated_at
    `,
    [meeting.id, updatedAt]
  );
  return { data: mapMeeting(result.rows[0]) };
};
