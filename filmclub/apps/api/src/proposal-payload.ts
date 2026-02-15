import type { DebtSettlementPayload, FoodOrderPayload, RecordEntity } from "@filmclub/shared";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isPositiveNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const validateMovieWatchPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as { title?: unknown; watchedOn?: unknown };
  return isNonEmptyString(candidate.title) && isNonEmptyString(candidate.watchedOn);
};

const validateAttendancePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as { attendees?: unknown };
  if (!Array.isArray(candidate.attendees) || candidate.attendees.length === 0) {
    return false;
  }
  return candidate.attendees.every((item) => {
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (!item || typeof item !== "object") {
      return false;
    }
    const attendee = item as { userId?: unknown; displayName?: unknown };
    return isNonEmptyString(attendee.userId) || isNonEmptyString(attendee.displayName);
  });
};

const validateDebtSettlementPayload = (payload: unknown): payload is DebtSettlementPayload => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Partial<DebtSettlementPayload>;
  if (
    !isNonEmptyString(candidate.fromUserId) ||
    !isNonEmptyString(candidate.toUserId) ||
    !isPositiveNumber(candidate.amount) ||
    !isNonEmptyString(candidate.currency)
  ) {
    return false;
  }
  if (candidate.fromUserId === candidate.toUserId) {
    return false;
  }
  if (candidate.note !== undefined && typeof candidate.note !== "string") {
    return false;
  }
  return true;
};

const validateFoodOrderPayload = (payload: unknown): payload is FoodOrderPayload => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Partial<FoodOrderPayload>;
  if (
    !isNonEmptyString(candidate.vendor) ||
    !isNonNegativeNumber(candidate.totalCost) ||
    !isNonEmptyString(candidate.currency) ||
    !isNonEmptyString(candidate.payerUserId)
  ) {
    return false;
  }
  if (candidate.participantUserIds !== undefined) {
    if (!Array.isArray(candidate.participantUserIds) || candidate.participantUserIds.length === 0) {
      return false;
    }
    if (!candidate.participantUserIds.every((item) => isNonEmptyString(item))) {
      return false;
    }
  }
  if (candidate.participantShares !== undefined) {
    if (!Array.isArray(candidate.participantShares) || candidate.participantShares.length === 0) {
      return false;
    }
    if (
      !candidate.participantShares.every(
        (share) =>
          share &&
          typeof share === "object" &&
          isNonEmptyString((share as { userId?: unknown }).userId) &&
          isNonNegativeNumber((share as { amount?: unknown }).amount)
      )
    ) {
      return false;
    }
    const total = candidate.participantShares.reduce((sum, share) => sum + (share.amount ?? 0), 0);
    if (Math.abs(total - (candidate.totalCost ?? 0)) > 0.01) {
      return false;
    }
  }
  return Array.isArray(candidate.participantUserIds) || Array.isArray(candidate.participantShares);
};

export const isValidPayloadForEntity = (entity: RecordEntity, payload: unknown) => {
  if (entity === "movie_watch") {
    return validateMovieWatchPayload(payload);
  }
  if (entity === "attendance") {
    return validateAttendancePayload(payload);
  }
  if (entity === "debt_settlement") {
    return validateDebtSettlementPayload(payload);
  }
  if (entity === "food_order") {
    return validateFoodOrderPayload(payload);
  }
  return false;
};
