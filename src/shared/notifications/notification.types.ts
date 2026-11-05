export type NotificationChannel = 'email' | 'sms';

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  metadata?: Record<string, string>;
}

export interface SmsMessage {
  to: string;
  body: string;
  metadata?: Record<string, string>;
}

export interface NotificationSendResult {
  status: 'sent';
  provider: string;
  providerMessageId?: string;
}

export interface NotificationNotConfiguredResult {
  status: 'not_configured';
  channel: NotificationChannel;
}

export type NotificationResult = NotificationSendResult | NotificationNotConfiguredResult;

export interface EmailNotificationProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<NotificationSendResult>;
}

export interface SmsNotificationProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<NotificationSendResult>;
}
