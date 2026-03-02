/**
 * Notifications API Contracts
 * Shared between frontend and backend
 */

export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export interface Notification {
  id: number;
  workspaceId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface NotificationListResponse {
  success: boolean;
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

export interface MarkNotificationReadRequest {
  id: number;
}

export interface MarkNotificationReadResponse {
  success: boolean;
  notification: Notification;
}

export interface MarkAllReadResponse {
  success: boolean;
  markedCount: number;
}

export interface NotificationSettings {
  workspaceId: string;
  userId?: string;
  settings: {
    email: boolean;
    push: boolean;
    slack: boolean;
    types: NotificationType[];
  };
}

export interface NotificationSettingsResponse {
  success: boolean;
  settings: NotificationSettings;
}
