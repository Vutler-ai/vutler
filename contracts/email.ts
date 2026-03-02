/**
 * Email API Contracts
 * Shared between frontend and backend
 */

export interface EmailFolder {
  name: string;        // "inbox", "sent", "drafts", "trash"
  count: number;       // unread count
  total: number;       // total emails in folder
}

export interface Email {
  id: number;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  folder: string;
  isRead: boolean;
  messageId?: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export interface EmailFoldersResponse {
  success: boolean;
  folders: EmailFolder[];
}

export interface EmailListResponse {
  success: boolean;
  emails: Email[];
  total: number;
  folder: string;
}

export interface EmailDetailResponse {
  success: boolean;
  email: Email;
}

export interface SendEmailRequest {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
}

export interface SendEmailResponse {
  success: boolean;
  email: Email;
}
