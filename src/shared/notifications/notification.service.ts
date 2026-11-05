import type {
  EmailMessage,
  EmailNotificationProvider,
  NotificationResult,
  SmsMessage,
  SmsNotificationProvider,
} from './notification.types.js';

/**
 * Provider-neutral notification boundary.
 *
 * Concrete providers are selected and registered by the application composition
 * root after the email/SMS vendor decision is made. No provider is selected here.
 */
class NotificationService {
  private emailProvider: EmailNotificationProvider | null = null;
  private smsProvider: SmsNotificationProvider | null = null;

  registerEmailProvider(provider: EmailNotificationProvider): void {
    this.emailProvider = provider;
  }

  registerSmsProvider(provider: SmsNotificationProvider): void {
    this.smsProvider = provider;
  }

  clearEmailProvider(): void {
    this.emailProvider = null;
  }

  clearSmsProvider(): void {
    this.smsProvider = null;
  }

  async sendEmail(message: EmailMessage): Promise<NotificationResult> {
    if (!this.emailProvider) return { status: 'not_configured', channel: 'email' };
    return this.emailProvider.send(message);
  }

  async sendSms(message: SmsMessage): Promise<NotificationResult> {
    if (!this.smsProvider) return { status: 'not_configured', channel: 'sms' };
    return this.smsProvider.send(message);
  }

  getConfiguredChannels(): { email: boolean; sms: boolean } {
    return { email: this.emailProvider !== null, sms: this.smsProvider !== null };
  }
}

export const notificationService = new NotificationService();
