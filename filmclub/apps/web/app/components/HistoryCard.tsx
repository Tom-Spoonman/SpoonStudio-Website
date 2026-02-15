"use client";

import type { ClubHistoryPage, PendingChangeStatus, RecordEntity } from "../filmclub-types";

interface HistoryCardProps {
  activeClubId: string;
  historyPage: ClubHistoryPage;
  statusFilter: "all" | PendingChangeStatus;
  entityFilter: "all" | RecordEntity;
  from: string;
  to: string;
  onStatusFilterChange: (value: "all" | PendingChangeStatus) => void;
  onEntityFilterChange: (value: "all" | RecordEntity) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export default function HistoryCard(props: HistoryCardProps) {
  const {
    activeClubId,
    historyPage,
    statusFilter,
    entityFilter,
    from,
    to,
    onStatusFilterChange,
    onEntityFilterChange,
    onFromChange,
    onToChange,
    onPrevPage,
    onNextPage
  } = props;
  const hasPrev = historyPage.offset > 0;
  const hasNext = historyPage.offset + historyPage.items.length < historyPage.total;

  return (
    <div className="card">
      <h2>History</h2>
      <div className="grid2">
        <div className="stack">
          <label>Status</label>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | PendingChangeStatus)}>
            <option value="all">all</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <div className="stack">
          <label>Entity</label>
          <select value={entityFilter} onChange={(event) => onEntityFilterChange(event.target.value as "all" | RecordEntity)}>
            <option value="all">all</option>
            <option value="movie_watch">movie_watch</option>
            <option value="food_order">food_order</option>
            <option value="attendance">attendance</option>
            <option value="debt_settlement">debt_settlement</option>
            <option value="meeting_schedule">meeting_schedule</option>
            <option value="meeting_update">meeting_update</option>
            <option value="meeting_start">meeting_start</option>
            <option value="meeting_complete">meeting_complete</option>
          </select>
        </div>
      </div>
      <div className="grid2">
        <div className="stack">
          <label>From</label>
          <input type="datetime-local" value={from} onChange={(event) => onFromChange(event.target.value)} />
        </div>
        <div className="stack">
          <label>To</label>
          <input type="datetime-local" value={to} onChange={(event) => onToChange(event.target.value)} />
        </div>
      </div>
      <div className="row">
        <button disabled={!hasPrev} onClick={onPrevPage}>Previous</button>
        <button disabled={!hasNext} onClick={onNextPage}>Next</button>
        <p>
          Showing {historyPage.items.length} of {historyPage.total}
        </p>
      </div>

      {historyPage.items.length === 0 && <p>No history yet.</p>}
      {historyPage.items.map((item) => (
        <div key={`history-${item.proposalId}`} className="stack history-item">
          <p>
            <span className="chip">{item.entity}</span>{" "}
            <span className={`chip chip-status-${item.status}`}>{item.status}</span>{" "}
            by {item.proposerDisplayName} on {new Date(item.createdAt).toLocaleString()}
          </p>
          <p>
            Status: {item.status}
            {item.committedAt
              ? ` | Committed by ${item.committedByDisplayName ?? item.committedByUserId} at ${new Date(item.committedAt).toLocaleString()}`
              : ""}
          </p>
          <pre>{JSON.stringify(item.payload, null, 2)}</pre>
          <p>
            Votes:{" "}
            {item.votes.length === 0 ? "none" : item.votes.map((vote) => `${vote.voterDisplayName}:${vote.decision}`).join(", ")}
          </p>
          <a href={`/clubs/${activeClubId}/proposals?proposalId=${item.proposalId}`}>Open Proposal</a>
        </div>
      ))}
    </div>
  );
}
