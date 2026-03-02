/**
 * Usage API Contracts
 * Shared between frontend and backend
 */

export interface TokenUsageRecord {
  id: number;
  workspaceId: string;
  agentId?: string;
  userId?: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface UsageByModel {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  costUsd: number;
  requests: number;
}

export interface UsageByAgent {
  agentId: string;
  agentName: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  costUsd: number;
  requests: number;
}

export interface UsageSummary {
  period: string;        // "today", "thisWeek", "thisMonth"
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  costUsd: number;
  requests: number;
}

export interface UsageStatsResponse {
  success: boolean;
  today: UsageSummary;
  thisWeek: UsageSummary;
  thisMonth: UsageSummary;
  byModel: UsageByModel[];
  byAgent: UsageByAgent[];
}

export interface UsageHistoryResponse {
  success: boolean;
  records: TokenUsageRecord[];
  total: number;
  summary: UsageSummary;
}

export interface UsageFilters {
  startDate?: string;    // ISO 8601
  endDate?: string;      // ISO 8601
  agentId?: string;
  model?: string;
  limit?: number;
  offset?: number;
}
