"use client";

import { useState } from "react";
import type { PendingChangeStatus, RecordEntity } from "../filmclub-types";

export const useHistoryControls = () => {
  const [statusFilter, setStatusFilter] = useState<"all" | PendingChangeStatus>("all");
  const [entityFilter, setEntityFilter] = useState<"all" | RecordEntity>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  const resetPage = () => setOffset(0);
  const nextPage = () => setOffset((prev) => prev + limit);
  const prevPage = () => setOffset((prev) => Math.max(0, prev - limit));

  return {
    statusFilter,
    setStatusFilter,
    entityFilter,
    setEntityFilter,
    from,
    setFrom,
    to,
    setTo,
    limit,
    offset,
    setOffset,
    resetPage,
    nextPage,
    prevPage
  };
};
