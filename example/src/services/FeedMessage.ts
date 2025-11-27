import type { PIIResult } from './PIIDetector';

export type MessageType =
  | 'user'
  | 'stage1'
  | 'stage2'
  | 'pii-result'
  | 'system';

export type MessageStatus = 'sending' | 'processing' | 'complete' | 'error';

export interface FeedMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  status: MessageStatus;
  isEditable?: boolean;
  piiResult?: PIIResult;
  error?: string;
}

export interface MessageQueue {
  pending: FeedMessage[];
  current: FeedMessage | null;
}
