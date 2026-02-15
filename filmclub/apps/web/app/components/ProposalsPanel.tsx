"use client";

import type { PendingChangeStatus, ProposalDetails, ProposedChange } from "../filmclub-types";

interface ProposalsPanelProps {
  proposals: ProposedChange[];
  statusFilter: "all" | PendingChangeStatus;
  selectedProposal: ProposalDetails | null;
  busy: boolean;
  memberNameById: (userId: string) => string;
  onStatusFilterChange: (status: "all" | PendingChangeStatus) => void;
  onSelectProposal: (proposalId: string) => void;
  onCastVote: (proposalId: string, decision: "approve" | "reject") => void;
}

export default function ProposalsPanel(props: ProposalsPanelProps) {
  const {
    proposals,
    statusFilter,
    selectedProposal,
    busy,
    memberNameById,
    onStatusFilterChange,
    onSelectProposal,
    onCastVote
  } = props;
  return (
    <div className="grid2">
      <div className="card">
        <h2>Proposals</h2>
        <div className="row">
          <label>Status</label>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | PendingChangeStatus)}>
            <option value="all">all</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
        <div className="stack">
          {proposals.length === 0 && <p>No proposals.</p>}
          {proposals.map((proposal) => (
            <button key={proposal.id} onClick={() => onSelectProposal(proposal.id)}>
              <span className="chip">{proposal.entity}</span>{" "}
              <span className={`chip chip-status-${proposal.status}`}>{proposal.status}</span>{" "}
              <span>{new Date(proposal.createdAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Proposal Details</h2>
        {!selectedProposal && <p>Select a proposal.</p>}
        {selectedProposal && (
          <div className="stack">
            <p>Status: <strong>{selectedProposal.proposal.status}</strong></p>
            <p>
              Entity: <span className="chip">{selectedProposal.proposal.entity}</span>
            </p>
            <p>Created: {new Date(selectedProposal.proposal.createdAt).toLocaleString()}</p>
            <pre>{JSON.stringify(selectedProposal.proposal.payload, null, 2)}</pre>
            <div className="row">
              <button
                disabled={busy || selectedProposal.proposal.status !== "pending"}
                onClick={() => onCastVote(selectedProposal.proposal.id, "approve")}
              >
                Approve
              </button>
              <button
                disabled={busy || selectedProposal.proposal.status !== "pending"}
                onClick={() => onCastVote(selectedProposal.proposal.id, "reject")}
              >
                Reject
              </button>
            </div>
            <h3>Votes</h3>
            {selectedProposal.votes.length === 0 && <p>No votes yet.</p>}
            {selectedProposal.votes.map((vote) => (
              <p key={vote.id}>{memberNameById(vote.voterUserId)}: {vote.decision}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
