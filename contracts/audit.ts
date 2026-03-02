/**
 * Audit Logs API Contracts
 * Shared between frontend and backend
 */

export type AuditAction = 
  | 'agent.create'
  | 'agent.update'
  | 'agent.delete'
  | 'agent.deploy'
  | 'integration.connect'
  | 'integration.disconnect'
  | 'user.login'
  | 'user.logout'
  | 'settings.update'
  | 'api.call'
  | 'file.upload'
  | 'file.delete';

export interface AuditLog {
  id: number;
  workspaceId: string;
  userId?: string;
  action: AuditAction;
  resourceType?: string;  // "agent", "integration", "file", etc.
  resourceId?: string;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogListResponse {
  success: boolean;
  logs: AuditLog[];
  total: number;
}

export interface AuditLogFilters {
  startDate?: string;    // ISO 8601
  endDate?: string;      // ISO 8601
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  limit?: number;
  offset?: number;
}

export interface CreateAuditLogRequest {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

export interface CreateAuditLogResponse {
  success: boolean;
  log: AuditLog;
}
