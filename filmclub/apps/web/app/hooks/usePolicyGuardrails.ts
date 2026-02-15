"use client";

import type { ApprovalPolicy, Club } from "../filmclub-types";

interface Params {
  clubMembersCount: number;
  activeClub: Club | null;
  settingsPolicyMode: ApprovalPolicy["mode"];
  settingsFixedApprovals: number;
  pendingProposalCount: number;
}

export const usePolicyGuardrails = (params: Params) => {
  const eligibleVoterCount = Math.max(params.clubMembersCount - 1, 0);
  const fixedImpossible =
    params.settingsPolicyMode === "fixed" && params.settingsFixedApprovals > eligibleVoterCount;
  const policyChanged =
    !!params.activeClub &&
    (params.activeClub.approvalPolicy.mode !== params.settingsPolicyMode ||
      (params.settingsPolicyMode === "fixed" &&
        (params.activeClub.approvalPolicy.requiredApprovals ?? 1) !== params.settingsFixedApprovals));
  const pendingWarning = policyChanged && params.pendingProposalCount > 0;

  return {
    eligibleVoterCount,
    fixedImpossible,
    policyChanged,
    pendingWarning
  };
};
