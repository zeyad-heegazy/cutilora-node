import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationService } from '../../../src/shared/notifications/notification.service.js';
import type { EmailNotificationProvider, SmsNotificationProvider } from '../../../src/shared/notifications/notification.types.js';

afterEach(() => {
  notificationService.clearEmailProvider();
  notificationService.clearSmsProvider();
});

describe('notification service provider boundary', () => {
  it('reports email and SMS as not configured until providers are registered', async () => {
    await expect(notificationService.sendEmail({ to: 'person@example.com', subject: 'Test', text: 'Test' }))
      .resolves.toEqual({ status: 'not_configured', channel: 'email' });
    await expect(notificationService.sendSms({ to: '+201000000000', body: 'Test' }))
      .resolves.toEqual({ status: 'not_configured', channel: 'sms' });
    expect(notificationService.getConfiguredChannels()).toEqual({ email: false, sms: false });
  });

  it('delegates email delivery to the registered provider', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent', provider: 'test-email', providerMessageId: 'email-1' });
    const provider: EmailNotificationProvider = { name: 'test-email', send };
    notificationService.registerEmailProvider(provider);

    await expect(notificationService.sendEmail({ to: 'person@example.com', subject: 'Hello', text: 'Hello' }))
      .resolves.toEqual({ status: 'sent', provider: 'test-email', providerMessageId: 'email-1' });
    expect(send).toHaveBeenCalledWith({ to: 'person@example.com', subject: 'Hello', text: 'Hello' });
    expect(notificationService.getConfiguredChannels()).toEqual({ email: true, sms: false });
  });

  it('delegates SMS delivery to the registered provider', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent', provider: 'test-sms' });
    const provider: SmsNotificationProvider = { name: 'test-sms', send };
    notificationService.registerSmsProvider(provider);

    await expect(notificationService.sendSms({ to: '+201000000000', body: 'Your code is 1234' }))
      .resolves.toEqual({ status: 'sent', provider: 'test-sms' });
    expect(send).toHaveBeenCalledWith({ to: '+201000000000', body: 'Your code is 1234' });
  });

  it('propagates provider failures instead of reporting a false success', async () => {
    notificationService.registerEmailProvider({
      name: 'failing-email',
      send: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    });

    await expect(notificationService.sendEmail({ to: 'person@example.com', subject: 'Hello' }))
      .rejects.toThrow('provider unavailable');
  });
});
