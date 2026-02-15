"use client";

import type { FormEvent } from "react";
import type { ApprovalPolicy, Club, ClubMembership } from "../filmclub-types";

interface ClubSettingsCardProps {
  activeClub: Club | null;
  activeMembership: ClubMembership | null;
  busy: boolean;
  settingsPolicyMode: ApprovalPolicy["mode"];
  settingsFixedApprovals: number;
  pendingProposalCount: number;
  eligibleVoterCount: number;
  onPolicyModeChange: (mode: ApprovalPolicy["mode"]) => void;
  onFixedApprovalsChange: (value: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function ClubSettingsCard(props: ClubSettingsCardProps) {
  const {
    activeClub,
    activeMembership,
    busy,
    settingsPolicyMode,
    settingsFixedApprovals,
    pendingProposalCount,
    eligibleVoterCount,
    onPolicyModeChange,
    onFixedApprovalsChange,
    onSubmit
  } = props;
  const fixedImpossible = settingsPolicyMode === "fixed" && settingsFixedApprovals > eligibleVoterCount;
  const policyChanged =
    !!activeClub &&
    (activeClub.approvalPolicy.mode !== settingsPolicyMode ||
      (settingsPolicyMode === "fixed" &&
        (activeClub.approvalPolicy.requiredApprovals ?? 1) !== settingsFixedApprovals));

  return (
    <div className="card">
      <h2>Club Settings</h2>
      <p>
        Current policy: <strong>{activeClub?.approvalPolicy.mode}</strong>
        {activeClub && activeClub.approvalPolicy.mode === "fixed" && activeClub.approvalPolicy.requiredApprovals
          ? ` (${activeClub.approvalPolicy.requiredApprovals} approvals)`
          : ""}
      </p>
      <p>Current eligible voters per proposal: {eligibleVoterCount}</p>
      {activeMembership?.role !== "owner" && <p>Only owners can edit policy settings.</p>}
      {fixedImpossible && <p>Fixed approvals cannot exceed eligible voters for current club size.</p>}
      {policyChanged && pendingProposalCount > 0 && (
        <p>
          Warning: {pendingProposalCount} pending proposal(s) exist. Policy changes can alter future resolution outcomes.
        </p>
      )}
      <form onSubmit={onSubmit} className="stack">
        <select
          value={settingsPolicyMode}
          onChange={(event) => onPolicyModeChange(event.target.value as ApprovalPolicy["mode"])}
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
            onChange={(event) => onFixedApprovalsChange(Number(event.target.value))}
            disabled={busy || activeMembership?.role !== "owner"}
          />
        )}
        <button type="submit" disabled={busy || activeMembership?.role !== "owner" || fixedImpossible}>
          Save Policy
        </button>
      </form>
    </div>
  );
}
