export type RecordEntity = "movie_watch" | "food_order" | "attendance" | "debt_settlement";

export type PendingChangeStatus = "pending" | "approved" | "rejected";

export interface ProposedChange<TPayload = unknown> {
  id: string;
  entity: RecordEntity;
  payload: TPayload;
  proposerUserId: string;
  status: PendingChangeStatus;
  createdAt: string;
}
