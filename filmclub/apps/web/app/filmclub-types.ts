export type ApprovalMode = "unanimous" | "majority" | "fixed";
export type PendingChangeStatus = "pending" | "approved" | "rejected";
export type RecordEntity = "movie_watch" | "food_order" | "attendance" | "debt_settlement";

export interface ApprovalPolicy {
  mode: ApprovalMode;
  requiredApprovals?: number;
}

export interface User {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface Club {
  id: string;
  name: string;
  joinCode: string;
  approvalPolicy: ApprovalPolicy;
  createdByUserId: string;
  createdAt: string;
}

export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: string;
}

export interface ProposedChange {
  id: string;
  clubId: string;
  entity: RecordEntity;
  payload: unknown;
  proposerUserId: string;
  status: PendingChangeStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface ChangeVote {
  id: string;
  proposedChangeId: string;
  voterUserId: string;
  decision: "approve" | "reject";
  createdAt: string;
}

export interface MeResponse {
  user: User;
}

export interface ClubListItem {
  club: Club;
  membership: ClubMembership;
}

export interface ProposalDetails {
  proposal: ProposedChange;
  votes: ChangeVote[];
}

export interface ClubMember {
  user: User;
  membership: ClubMembership;
}

export interface ClubBalance {
  userId: string;
  displayName: string;
  currency: string;
  netAmount: number;
}

export interface ClubBalanceSummary {
  userId: string;
  displayName: string;
  currency: string;
  owes: number;
  owed: number;
}

export interface ClubDebtMatrixRow {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  currency: string;
  amount: number;
}

export interface ClubHistoryItem {
  proposalId: string;
  clubId: string;
  entity: RecordEntity;
  payload: unknown;
  proposerUserId: string;
  proposerDisplayName: string;
  status: PendingChangeStatus;
  createdAt: string;
  resolvedAt?: string;
  committedAt?: string;
  committedByUserId?: string;
  committedByDisplayName?: string;
  votes: Array<{
    id: string;
    voterUserId: string;
    voterDisplayName: string;
    decision: "approve" | "reject";
    createdAt: string;
  }>;
}

export interface ClubHistoryPage {
  items: ClubHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
