"use client";

import { FormEvent, useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const tokenStorageKey = "filmclub_token";

type ApprovalMode = "unanimous" | "majority" | "fixed";
type PendingChangeStatus = "pending" | "approved" | "rejected";
type RecordEntity = "movie_watch" | "food_order" | "attendance" | "debt_settlement";

interface ApprovalPolicy {
  mode: ApprovalMode;
  requiredApprovals?: number;
}

interface User {
  id: string;
  displayName: string;
  createdAt: string;
}

interface Club {
  id: string;
  name: string;
  joinCode: string;
  approvalPolicy: ApprovalPolicy;
  createdByUserId: string;
  createdAt: string;
}

interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
}

interface ProposedChange {
  id: string;
  clubId: string;
  entity: RecordEntity;
  payload: unknown;
  proposerUserId: string;
  status: PendingChangeStatus;
  createdAt: string;
  resolvedAt?: string;
}

interface ChangeVote {
  id: string;
  proposedChangeId: string;
  voterUserId: string;
  decision: "approve" | "reject";
  createdAt: string;
}

interface MeResponse {
  user: User;
}

interface ClubListItem {
  club: Club;
  membership: ClubMembership;
}

interface ProposalDetails {
  proposal: ProposedChange;
  votes: ChangeVote[];
}

const defaultPayloadByEntity: Record<RecordEntity, unknown> = {
  movie_watch: { title: "", watchedOn: "" },
  food_order: { vendor: "", totalCost: 0, currency: "EUR" },
  attendance: { attendees: [] },
  debt_settlement: { fromUserId: "", toUserId: "", amount: 0, currency: "EUR" }
};

const tryParseJson = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export default function HomePage() {
  const [health, setHealth] = useState<string>("checking");
  const [token, setToken] = useState<string>("");
  const [me, setMe] = useState<User | null>(null);
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [activeClubId, setActiveClubId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposedChange[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<ProposalDetails | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PendingChangeStatus>("pending");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [clubName, setClubName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [policyMode, setPolicyMode] = useState<ApprovalPolicy["mode"]>("majority");
  const [fixedApprovals, setFixedApprovals] = useState(2);

  const [proposalEntity, setProposalEntity] = useState<RecordEntity>("movie_watch");
  const [proposalPayloadText, setProposalPayloadText] = useState(
    JSON.stringify(defaultPayloadByEntity.movie_watch, null, 2)
  );

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const loadHealth = async () => {
    try {
      const response = await fetch(`${apiBase}/health`, { cache: "no-store" });
      const data = (await response.json()) as { status: string };
      setHealth(data.status);
    } catch {
      setHealth("offline");
    }
  };

  const loadMe = async () => {
    if (!token) {
      setMe(null);
      return;
    }
    const response = await fetch(`${apiBase}/v1/me`, { headers: authHeaders, cache: "no-store" });
    if (!response.ok) {
      setToken("");
      localStorage.removeItem(tokenStorageKey);
      setMe(null);
      return;
    }
    const data = (await response.json()) as MeResponse;
    setMe(data.user);
  };

  const loadClubs = async () => {
    if (!token) {
      setClubs([]);
      return;
    }
    const response = await fetch(`${apiBase}/v1/me/clubs`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as ClubListItem[];
    setClubs(data);
    if (data.length > 0 && !data.some((item) => item.club.id === activeClubId)) {
      setActiveClubId(data[0].club.id);
    }
  };

  const loadProposals = async () => {
    if (!token || !activeClubId) {
      setProposals([]);
      setSelectedProposal(null);
      return;
    }
    const query = new URLSearchParams({
      clubId: activeClubId
    });
    if (statusFilter !== "all") {
      query.set("status", statusFilter);
    }
    const response = await fetch(`${apiBase}/v1/proposed-changes?${query.toString()}`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as ProposedChange[];
    setProposals(data);
    if (selectedProposal && !data.some((item) => item.id === selectedProposal.proposal.id)) {
      setSelectedProposal(null);
    }
  };

  const loadProposalDetails = async (proposalId: string) => {
    const response = await fetch(`${apiBase}/v1/proposed-changes/${proposalId}`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as ProposalDetails;
    setSelectedProposal(data);
  };

  useEffect(() => {
    loadHealth();
    const storedToken = localStorage.getItem(tokenStorageKey) ?? "";
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [token]);

  useEffect(() => {
    loadClubs();
  }, [token, me]);

  useEffect(() => {
    loadProposals();
  }, [token, activeClubId, statusFilter]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim()) {
      setMessage("Display name is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiBase}/v1/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() })
    });
    const data = (await response.json()) as { token?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.token) {
      setMessage(data.error ?? `${authMode} failed`);
      return;
    }
    setToken(data.token);
    localStorage.setItem(tokenStorageKey, data.token);
    setDisplayName("");
    setMessage(`${authMode} successful`);
  };

  const logout = () => {
    setToken("");
    setMe(null);
    setClubs([]);
    setActiveClubId("");
    setProposals([]);
    setSelectedProposal(null);
    localStorage.removeItem(tokenStorageKey);
    setMessage("Logged out.");
  };

  const createClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clubName.trim()) {
      setMessage("Club name is required.");
      return;
    }
    const policy: ApprovalPolicy =
      policyMode === "fixed"
        ? { mode: "fixed", requiredApprovals: fixedApprovals }
        : { mode: policyMode };
    setBusy(true);
    const response = await fetch(`${apiBase}/v1/clubs`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ name: clubName.trim(), approvalPolicy: policy })
    });
    const data = (await response.json()) as { error?: string; club?: Club };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error ?? "Create club failed");
      return;
    }
    setClubName("");
    setMessage(`Created club. Join code: ${data.club?.joinCode ?? "n/a"}`);
    await loadClubs();
  };

  const submitJoinClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinCode.trim()) {
      setMessage("Join code is required.");
      return;
    }
    setBusy(true);
    const response = await fetch(`${apiBase}/v1/clubs/join`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode: joinCode.trim() })
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error ?? "Join failed");
      return;
    }
    setJoinCode("");
    setMessage("Joined club.");
    await loadClubs();
  };

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeClubId) {
      setMessage("Select a club first.");
      return;
    }
    const payload = tryParseJson(proposalPayloadText);
    if (payload === null) {
      setMessage("Proposal payload must be valid JSON.");
      return;
    }
    setBusy(true);
    const response = await fetch(`${apiBase}/v1/proposed-changes`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId: activeClubId,
        entity: proposalEntity,
        payload
      })
    });
    const data = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) {
      setMessage(data.error ?? "Create proposal failed");
      return;
    }
    setMessage("Proposal created.");
    await loadProposals();
    await loadProposalDetails(data.id);
  };

  const castVote = async (proposalId: string, decision: "approve" | "reject") => {
    setBusy(true);
    const response = await fetch(`${apiBase}/v1/proposed-changes/${proposalId}/${decision}`, {
      method: "POST",
      headers: authHeaders
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error ?? "Vote failed");
      return;
    }
    setMessage(`Vote submitted: ${decision}`);
    await loadProposals();
    await loadProposalDetails(proposalId);
  };

  return (
    <main>
      <h1>filmclub</h1>
      <p>API status: <span className="pill">{health}</span></p>

      {message && <div className="card"><p>{message}</p></div>}

      {!token && (
        <div className="card">
          <h2>Auth</h2>
          <form onSubmit={submitAuth} className="stack">
            <input
              placeholder="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <div className="row">
              <button type="submit" disabled={busy} onClick={() => setAuthMode("register")}>Register</button>
              <button type="submit" disabled={busy} onClick={() => setAuthMode("login")}>Login</button>
            </div>
          </form>
        </div>
      )}

      {token && me && (
        <>
          <div className="card">
            <h2>Session</h2>
            <p>Signed in as <strong>{me.displayName}</strong></p>
            <button onClick={logout} disabled={busy}>Logout</button>
          </div>

          <div className="grid2">
            <div className="card">
              <h2>Create Club</h2>
              <form onSubmit={createClub} className="stack">
                <input
                  placeholder="Club name"
                  value={clubName}
                  onChange={(event) => setClubName(event.target.value)}
                />
                <select value={policyMode} onChange={(event) => setPolicyMode(event.target.value as ApprovalPolicy["mode"])}>
                  <option value="majority">Majority</option>
                  <option value="unanimous">Unanimous</option>
                  <option value="fixed">Fixed approvals</option>
                </select>
                {policyMode === "fixed" && (
                  <input
                    type="number"
                    min={1}
                    value={fixedApprovals}
                    onChange={(event) => setFixedApprovals(Number(event.target.value))}
                  />
                )}
                <button type="submit" disabled={busy}>Create</button>
              </form>
            </div>

            <div className="card">
              <h2>Join Club</h2>
              <form onSubmit={submitJoinClub} className="stack">
                <input
                  placeholder="Join code"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                />
                <button type="submit" disabled={busy}>Join</button>
              </form>
            </div>
          </div>

          <div className="card">
            <h2>My Clubs</h2>
            <div className="stack">
              {clubs.length === 0 && <p>No clubs yet.</p>}
              {clubs.map((item) => (
                <button
                  key={item.club.id}
                  className={item.club.id === activeClubId ? "active" : ""}
                  onClick={() => setActiveClubId(item.club.id)}
                >
                  {item.club.name} ({item.membership.role}) - code {item.club.joinCode}
                </button>
              ))}
            </div>
          </div>

          {activeClubId && (
            <>
              <div className="card">
                <h2>Create Proposal</h2>
                <form onSubmit={submitProposal} className="stack">
                  <select
                    value={proposalEntity}
                    onChange={(event) => {
                      const entity = event.target.value as RecordEntity;
                      setProposalEntity(entity);
                      setProposalPayloadText(JSON.stringify(defaultPayloadByEntity[entity], null, 2));
                    }}
                  >
                    <option value="movie_watch">movie_watch</option>
                    <option value="food_order">food_order</option>
                    <option value="attendance">attendance</option>
                    <option value="debt_settlement">debt_settlement</option>
                  </select>
                  <textarea
                    value={proposalPayloadText}
                    onChange={(event) => setProposalPayloadText(event.target.value)}
                    rows={8}
                  />
                  <button type="submit" disabled={busy}>Submit Proposal</button>
                </form>
              </div>

              <div className="grid2">
                <div className="card">
                  <h2>Proposals</h2>
                  <div className="row">
                    <label>Status</label>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PendingChangeStatus)}>
                      <option value="all">all</option>
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </div>
                  <div className="stack">
                    {proposals.length === 0 && <p>No proposals.</p>}
                    {proposals.map((proposal) => (
                      <button key={proposal.id} onClick={() => loadProposalDetails(proposal.id)}>
                        {proposal.entity} - {proposal.status}
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
                      <p>Entity: {selectedProposal.proposal.entity}</p>
                      <pre>{JSON.stringify(selectedProposal.proposal.payload, null, 2)}</pre>
                      <div className="row">
                        <button
                          disabled={busy || selectedProposal.proposal.status !== "pending"}
                          onClick={() => castVote(selectedProposal.proposal.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy || selectedProposal.proposal.status !== "pending"}
                          onClick={() => castVote(selectedProposal.proposal.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                      <h3>Votes</h3>
                      {selectedProposal.votes.length === 0 && <p>No votes yet.</p>}
                      {selectedProposal.votes.map((vote) => (
                        <p key={vote.id}>{vote.voterUserId}: {vote.decision}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
