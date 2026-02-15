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

interface ClubMember {
  user: User;
  membership: ClubMembership;
}

interface ClubBalance {
  userId: string;
  displayName: string;
  currency: string;
  netAmount: number;
}

interface ClubBalanceSummary {
  userId: string;
  displayName: string;
  currency: string;
  owes: number;
  owed: number;
}

interface ClubDebtMatrixRow {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  currency: string;
  amount: number;
}

export default function FilmclubClient() {
  const [health, setHealth] = useState<string>("checking");
  const [token, setToken] = useState<string>("");
  const [me, setMe] = useState<User | null>(null);
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [activeClubId, setActiveClubId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposedChange[]>([]);
  const [balances, setBalances] = useState<ClubBalance[]>([]);
  const [balanceSummary, setBalanceSummary] = useState<ClubBalanceSummary[]>([]);
  const [debtMatrix, setDebtMatrix] = useState<ClubDebtMatrixRow[]>([]);
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
  const [settingsPolicyMode, setSettingsPolicyMode] = useState<ApprovalPolicy["mode"]>("majority");
  const [settingsFixedApprovals, setSettingsFixedApprovals] = useState(2);

  const [proposalEntity, setProposalEntity] = useState<RecordEntity>("movie_watch");
  const [movieTitle, setMovieTitle] = useState("");
  const [movieWatchedOn, setMovieWatchedOn] = useState("");
  const [foodVendor, setFoodVendor] = useState("");
  const [foodTotalCost, setFoodTotalCost] = useState("0");
  const [foodCurrency, setFoodCurrency] = useState("EUR");
  const [attendanceMemberIds, setAttendanceMemberIds] = useState<string[]>([]);
  const [debtFromUserId, setDebtFromUserId] = useState("");
  const [debtToUserId, setDebtToUserId] = useState("");
  const [debtAmount, setDebtAmount] = useState("0");
  const [debtCurrency, setDebtCurrency] = useState("EUR");
  const [orderVendor, setOrderVendor] = useState("");
  const [orderTotalCost, setOrderTotalCost] = useState("0");
  const [orderCurrency, setOrderCurrency] = useState("EUR");
  const [orderPayerUserId, setOrderPayerUserId] = useState("");
  const [orderParticipantUserIds, setOrderParticipantUserIds] = useState<string[]>([]);
  const [useCustomSplit, setUseCustomSplit] = useState(false);
  const [customShares, setCustomShares] = useState<Array<{ userId: string; amount: string }>>([]);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const activeClubEntry = clubs.find((item) => item.club.id === activeClubId) ?? null;
  const activeClub = activeClubEntry?.club ?? null;
  const activeMembership = activeClubEntry?.membership ?? null;

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

  const loadClubMembers = async () => {
    if (!token || !activeClubId) {
      setClubMembers([]);
      return;
    }
    const response = await fetch(`${apiBase}/v1/clubs/${activeClubId}/members`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as ClubMember[];
    setClubMembers(data);
    if (data.length > 0) {
      const hasFrom = data.some((item) => item.user.id === debtFromUserId);
      const hasTo = data.some((item) => item.user.id === debtToUserId);
      if (!hasFrom) {
        setDebtFromUserId(data[0].user.id);
      }
      if (!hasTo) {
        const fallback = data.find((item) => item.user.id !== data[0].user.id);
        setDebtToUserId((fallback ?? data[0]).user.id);
      }
    }
  };

  const loadBalances = async () => {
    if (!token || !activeClubId) {
      setBalances([]);
      return;
    }
    const response = await fetch(`${apiBase}/v1/clubs/${activeClubId}/balance-overview?currency=EUR`, {
      headers: authHeaders,
      cache: "no-store"
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      balances: ClubBalance[];
      summary: ClubBalanceSummary[];
      matrix: ClubDebtMatrixRow[];
    };
    setBalances(data.balances);
    setBalanceSummary(data.summary);
    setDebtMatrix(data.matrix);
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

  useEffect(() => {
    loadClubMembers();
  }, [token, activeClubId]);

  useEffect(() => {
    loadBalances();
  }, [token, activeClubId]);

  useEffect(() => {
    if (!activeClub) {
      setSettingsPolicyMode("majority");
      setSettingsFixedApprovals(2);
      return;
    }
    setSettingsPolicyMode(activeClub.approvalPolicy.mode);
    setSettingsFixedApprovals(activeClub.approvalPolicy.requiredApprovals ?? 2);
  }, [activeClub]);

  useEffect(() => {
    if (clubMembers.length === 0) {
      setAttendanceMemberIds([]);
      setOrderPayerUserId("");
      setOrderParticipantUserIds([]);
      setCustomShares([]);
      return;
    }
    setAttendanceMemberIds((prev) => prev.filter((id) => clubMembers.some((member) => member.user.id === id)));
    setOrderPayerUserId((prev) => {
      if (prev && clubMembers.some((member) => member.user.id === prev)) {
        return prev;
      }
      return clubMembers[0].user.id;
    });
    setOrderParticipantUserIds((prev) => {
      const valid = prev.filter((id) => clubMembers.some((member) => member.user.id === id));
      return valid.length > 0 ? valid : clubMembers.map((member) => member.user.id);
    });
    setCustomShares((prev) => {
      const existing = new Map(prev.map((entry) => [entry.userId, entry.amount]));
      return clubMembers.map((member) => ({
        userId: member.user.id,
        amount: existing.get(member.user.id) ?? "0"
      }));
    });
  }, [clubMembers]);

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

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${apiBase}/v1/auth/logout`, {
          method: "POST",
          headers: authHeaders
        });
      } catch {
        // Best-effort server logout; local session is always cleared.
      }
    }
    setToken("");
    setMe(null);
    setClubs([]);
    setClubMembers([]);
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

  const updateClubPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeClubId) {
      setMessage("Select a club first.");
      return;
    }
    if (activeMembership?.role !== "owner") {
      setMessage("Only club owners can update approval policy.");
      return;
    }
    if (settingsPolicyMode === "fixed" && (!Number.isInteger(settingsFixedApprovals) || settingsFixedApprovals < 1)) {
      setMessage("Fixed approvals must be an integer greater than or equal to 1.");
      return;
    }
    const approvalPolicy: ApprovalPolicy =
      settingsPolicyMode === "fixed"
        ? { mode: "fixed", requiredApprovals: settingsFixedApprovals }
        : { mode: settingsPolicyMode };

    setBusy(true);
    const response = await fetch(`${apiBase}/v1/clubs/${activeClubId}/approval-policy`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalPolicy })
    });
    const data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error ?? "Update approval policy failed");
      return;
    }
    setMessage("Approval policy updated.");
    await loadClubs();
  };

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeClubId) {
      setMessage("Select a club first.");
      return;
    }
    let payload: unknown = {};
    if (proposalEntity === "movie_watch") {
      if (!movieTitle.trim() || !movieWatchedOn.trim()) {
        setMessage("Movie title and watched-on date are required.");
        return;
      }
      payload = {
        title: movieTitle.trim(),
        watchedOn: movieWatchedOn.trim()
      };
    } else if (proposalEntity === "food_order") {
      if (!foodVendor.trim()) {
        setMessage("Food vendor is required.");
        return;
      }
      const totalCost = Number(foodTotalCost);
      if (!Number.isFinite(totalCost) || totalCost < 0) {
        setMessage("Food total cost must be a non-negative number.");
        return;
      }
      payload = {
        vendor: foodVendor.trim(),
        totalCost,
        currency: foodCurrency.trim().toUpperCase()
      };
    } else if (proposalEntity === "attendance") {
      const attendees = clubMembers
        .filter((member) => attendanceMemberIds.includes(member.user.id))
        .map((member) => ({
          userId: member.user.id,
          displayName: member.user.displayName
        }));
      if (attendees.length === 0) {
        setMessage("Select at least one attendee.");
        return;
      }
      payload = { attendees };
    } else if (proposalEntity === "debt_settlement") {
      if (!debtFromUserId.trim() || !debtToUserId.trim()) {
        setMessage("From/To members are required.");
        return;
      }
      if (debtFromUserId === debtToUserId) {
        setMessage("From and To members must be different.");
        return;
      }
      const amount = Number(debtAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        setMessage("Debt amount must be a non-negative number.");
        return;
      }
      payload = {
        fromUserId: debtFromUserId.trim(),
        toUserId: debtToUserId.trim(),
        amount,
        currency: debtCurrency.trim().toUpperCase()
      };
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

  const submitFoodOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeClubId) {
      setMessage("Select a club first.");
      return;
    }
    if (!orderVendor.trim()) {
      setMessage("Order vendor is required.");
      return;
    }
    const totalCost = Number(orderTotalCost);
    if (!Number.isFinite(totalCost) || totalCost < 0) {
      setMessage("Order total cost must be a non-negative number.");
      return;
    }
    if (!orderPayerUserId) {
      setMessage("Select payer.");
      return;
    }
    if (orderParticipantUserIds.length === 0) {
      setMessage("Select at least one participant.");
      return;
    }
    let participantShares: Array<{ userId: string; amount: number }> | undefined;
    let participantUserIds: string[] | undefined;
    if (useCustomSplit) {
      participantShares = customShares
        .filter((entry) => orderParticipantUserIds.includes(entry.userId))
        .map((entry) => ({ userId: entry.userId, amount: Number(entry.amount) }));
      if (participantShares.some((entry) => !Number.isFinite(entry.amount) || entry.amount < 0)) {
        setMessage("All custom shares must be non-negative numbers.");
        return;
      }
      const totalShares = participantShares.reduce((sum, entry) => sum + entry.amount, 0);
      if (Math.abs(totalShares - totalCost) > 0.01) {
        setMessage("Custom shares must sum exactly to total cost.");
        return;
      }
    } else {
      participantUserIds = orderParticipantUserIds;
    }
    setBusy(true);
    const response = await fetch(`${apiBase}/v1/food-orders`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId: activeClubId,
        vendor: orderVendor.trim(),
        totalCost,
        currency: orderCurrency.trim().toUpperCase(),
        payerUserId: orderPayerUserId,
        participantUserIds,
        participantShares
      })
    });
    const data = (await response.json()) as { error?: string; id?: string; status?: PendingChangeStatus };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error ?? "Create food order failed");
      return;
    }
    if (data.status === "approved") {
      setMessage("Food order proposal auto-approved and balances updated.");
    } else {
      setMessage("Food order submitted as proposal. It must be approved before balances update.");
    }
    await loadProposals();
    if (data.id) {
      await loadProposalDetails(data.id);
    }
    await loadBalances();
  };

  const memberNameById = (userId: string) => {
    const found = clubMembers.find((item) => item.user.id === userId);
    return found ? found.user.displayName : userId;
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
                <h2>Club Settings</h2>
                <p>
                  Current policy: <strong>{activeClub?.approvalPolicy.mode}</strong>
                  {activeClub && activeClub.approvalPolicy.mode === "fixed" && activeClub.approvalPolicy.requiredApprovals
                    ? ` (${activeClub.approvalPolicy.requiredApprovals} approvals)`
                    : ""}
                </p>
                {activeMembership?.role !== "owner" && <p>Only owners can edit policy settings.</p>}
                <form onSubmit={updateClubPolicy} className="stack">
                  <select
                    value={settingsPolicyMode}
                    onChange={(event) => setSettingsPolicyMode(event.target.value as ApprovalPolicy["mode"])}
                    disabled={busy || activeMembership?.role !== "owner"}
                  >
                    <option value="majority">Majority</option>
                    <option value="unanimous">Unanimous</option>
                    <option value="fixed">Fixed approvals</option>
                  </select>
                  {settingsPolicyMode === "fixed" && (
                    <input
                      type="number"
                      min={1}
                      value={settingsFixedApprovals}
                      onChange={(event) => setSettingsFixedApprovals(Number(event.target.value))}
                      disabled={busy || activeMembership?.role !== "owner"}
                    />
                  )}
                  <button type="submit" disabled={busy || activeMembership?.role !== "owner"}>
                    Save Policy
                  </button>
                </form>
              </div>

              <div className="card">
                <h2>Create Proposal</h2>
                <form onSubmit={submitProposal} className="stack">
                  <select
                    value={proposalEntity}
                    onChange={(event) => {
                      const entity = event.target.value as RecordEntity;
                      setProposalEntity(entity);
                    }}
                  >
                    <option value="movie_watch">movie_watch</option>
                    <option value="food_order">food_order</option>
                    <option value="attendance">attendance</option>
                    <option value="debt_settlement">debt_settlement</option>
                  </select>
                  {proposalEntity === "movie_watch" && (
                    <div className="stack">
                      <input
                        placeholder="Movie title"
                        value={movieTitle}
                        onChange={(event) => setMovieTitle(event.target.value)}
                      />
                      <input
                        type="date"
                        value={movieWatchedOn}
                        onChange={(event) => setMovieWatchedOn(event.target.value)}
                      />
                    </div>
                  )}
                  {proposalEntity === "food_order" && (
                    <div className="stack">
                      <input
                        placeholder="Vendor"
                        value={foodVendor}
                        onChange={(event) => setFoodVendor(event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={foodTotalCost}
                        onChange={(event) => setFoodTotalCost(event.target.value)}
                      />
                      <input
                        placeholder="Currency (e.g. EUR)"
                        value={foodCurrency}
                        onChange={(event) => setFoodCurrency(event.target.value)}
                      />
                    </div>
                  )}
                  {proposalEntity === "attendance" && (
                    <div className="stack">
                      <select
                        multiple
                        value={attendanceMemberIds}
                        onChange={(event) => {
                          const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                          setAttendanceMemberIds(values);
                        }}
                      >
                        {clubMembers.map((member) => (
                          <option key={`attendance-${member.user.id}`} value={member.user.id}>
                            {member.user.displayName}
                          </option>
                        ))}
                      </select>
                      <small>Hold Ctrl/Cmd to select multiple members.</small>
                    </div>
                  )}
                  {proposalEntity === "debt_settlement" && (
                    <div className="stack">
                      <select
                        value={debtFromUserId}
                        onChange={(event) => setDebtFromUserId(event.target.value)}
                      >
                        {clubMembers.map((member) => (
                          <option key={`from-${member.user.id}`} value={member.user.id}>
                            {member.user.displayName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={debtToUserId}
                        onChange={(event) => setDebtToUserId(event.target.value)}
                      >
                        {clubMembers.map((member) => (
                          <option key={`to-${member.user.id}`} value={member.user.id}>
                            {member.user.displayName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={debtAmount}
                        onChange={(event) => setDebtAmount(event.target.value)}
                      />
                      <input
                        placeholder="Currency (e.g. EUR)"
                        value={debtCurrency}
                        onChange={(event) => setDebtCurrency(event.target.value)}
                      />
                    </div>
                  )}
                  <button type="submit" disabled={busy}>Submit Proposal</button>
                </form>
              </div>

              <div className="card">
                <h2>Food Order + Balances</h2>
                <form onSubmit={submitFoodOrder} className="stack">
                  <input
                    placeholder="Vendor"
                    value={orderVendor}
                    onChange={(event) => setOrderVendor(event.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={orderTotalCost}
                    onChange={(event) => setOrderTotalCost(event.target.value)}
                  />
                  <input
                    placeholder="Currency (e.g. EUR)"
                    value={orderCurrency}
                    onChange={(event) => setOrderCurrency(event.target.value)}
                  />
                  <label>Payer</label>
                  <select value={orderPayerUserId} onChange={(event) => setOrderPayerUserId(event.target.value)}>
                    {clubMembers.map((member) => (
                      <option key={`payer-${member.user.id}`} value={member.user.id}>
                        {member.user.displayName}
                      </option>
                    ))}
                  </select>
                  <label>Participants</label>
                  <select
                    multiple
                    value={orderParticipantUserIds}
                    onChange={(event) => {
                      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setOrderParticipantUserIds(values);
                    }}
                  >
                    {clubMembers.map((member) => (
                      <option key={`order-participant-${member.user.id}`} value={member.user.id}>
                        {member.user.displayName}
                      </option>
                    ))}
                  </select>
                  <label>
                    <input
                      type="checkbox"
                      checked={useCustomSplit}
                      onChange={(event) => setUseCustomSplit(event.target.checked)}
                    />{" "}
                    Use custom split
                  </label>
                  {useCustomSplit && (
                    <div className="stack">
                      {clubMembers
                        .filter((member) => orderParticipantUserIds.includes(member.user.id))
                        .map((member) => (
                          <div className="row" key={`share-${member.user.id}`}>
                            <label>{member.user.displayName}</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={customShares.find((entry) => entry.userId === member.user.id)?.amount ?? "0"}
                              onChange={(event) =>
                                setCustomShares((prev) =>
                                  prev.map((entry) =>
                                    entry.userId === member.user.id
                                      ? { ...entry, amount: event.target.value }
                                      : entry
                                  )
                                )
                              }
                            />
                          </div>
                        ))}
                    </div>
                  )}
                  <button type="submit" disabled={busy}>Record Food Order</button>
                </form>

                <h3>Balances</h3>
                {balances.length === 0 && <p>No balances yet.</p>}
                {balances.map((balance) => (
                  <p key={`${balance.userId}:${balance.currency}`}>
                    {balance.displayName}: {balance.netAmount.toFixed(2)} {balance.currency}
                  </p>
                ))}
                <h3>Summary</h3>
                {balanceSummary.map((entry) => (
                  <p key={`summary-${entry.userId}:${entry.currency}`}>
                    {entry.displayName}: owes {entry.owes.toFixed(2)} {entry.currency}, owed {entry.owed.toFixed(2)}{" "}
                    {entry.currency}
                  </p>
                ))}
                <h3>Debt Matrix</h3>
                {debtMatrix.length === 0 && <p>No outstanding directed debts.</p>}
                {debtMatrix.map((row) => (
                  <p key={`matrix-${row.fromUserId}-${row.toUserId}-${row.currency}`}>
                    {row.fromDisplayName} owes {row.toDisplayName}: {row.amount.toFixed(2)} {row.currency}
                  </p>
                ))}
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
                        <p key={vote.id}>{memberNameById(vote.voterUserId)}: {vote.decision}</p>
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
