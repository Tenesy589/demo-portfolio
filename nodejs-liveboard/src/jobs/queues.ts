export const ACTIVITY_QUEUE = 'activity';
export const NOTIFY_QUEUE = 'notifications';

export interface ActivityJob {
  boardId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface NotifyJob {
  to: string;
  subject: string;
  body: string;
}
