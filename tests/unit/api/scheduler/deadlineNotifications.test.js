/**
 * Unit tests for deadline notification scheduler
 * 
 * Tests notification triggers at: 30 days, 7 days, 1 day before May 1
 */

const {
  DeadlineNotificationScheduler,
  checkNotification,
  getWarningMessage,
  NOTIFICATION_THRESHOLDS
} = require('../../../../src/api/scheduler/deadlineNotifications');

describe('Deadline Notification Scheduler', () => {
  describe('checkNotification', () => {
    it('should return notification when exactly 30 days remain', () => {
      // April 1, 2025 - exactly 30 days before May 1
      const april1 = new Date(2025, 3, 1, 0, 0, 0);
      const notification = checkNotification(april1);
      
      expect(notification).not.toBeNull();
      expect(notification.type).toBe('deadline_warning');
      expect(notification.threshold_days).toBe(30);
      expect(notification.days_remaining).toBe(30);
    });

    it('should return notification when exactly 7 days remain', () => {
      // April 24, 2025 - exactly 7 days before May 1
      const april24 = new Date(2025, 3, 24, 0, 0, 0);
      const notification = checkNotification(april24);
      
      expect(notification).not.toBeNull();
      expect(notification.threshold_days).toBe(7);
    });

    it('should return notification when exactly 1 day remains', () => {
      // April 30, 2025 - exactly 1 day before May 1
      const april30 = new Date(2025, 3, 30, 0, 0, 0);
      const notification = checkNotification(april30);
      
      expect(notification).not.toBeNull();
      expect(notification.threshold_days).toBe(1);
    });

    it('should return null for non-threshold days', () => {
      // April 15, 2025 - 16 days before deadline (not a threshold)
      const april15 = new Date(2025, 3, 15, 0, 0, 0);
      const notification = checkNotification(april15);
      
      expect(notification).toBeNull();
    });

    it('should return null after deadline', () => {
      const may10 = new Date(2025, 4, 10, 0, 0, 0);
      const notification = checkNotification(may10);
      
      expect(notification).toBeNull();
    });

    it('should include deadline_status in notification', () => {
      const april1 = new Date(2025, 3, 1, 0, 0, 0);
      const notification = checkNotification(april1);
      
      expect(notification.deadline_status).toBeDefined();
      expect(notification.deadline_status.filing_year).toBe(2025);
    });
  });

  describe('getWarningMessage', () => {
    it('should return appropriate message for 30 days', () => {
      const message = getWarningMessage(30);
      expect(message).toContain('30 days');
      expect(message).toContain('May 1');
    });

    it('should return urgent message for 7 days', () => {
      const message = getWarningMessage(7);
      expect(message).toContain('URGENT');
      expect(message).toContain('7 days');
      expect(message).toContain('$400');
    });

    it('should return final warning for 1 day', () => {
      const message = getWarningMessage(1);
      expect(message).toContain('FINAL WARNING');
      expect(message).toContain('TOMORROW');
    });

    it('should return generic message for other values', () => {
      const message = getWarningMessage(15);
      expect(message).toContain('15 days');
    });
  });

  describe('DeadlineNotificationScheduler', () => {
    let scheduler;
    let mockSender;
    let mockRecipientProvider;

    beforeEach(() => {
      mockSender = jest.fn().mockResolvedValue(undefined);
      mockRecipientProvider = jest.fn().mockResolvedValue(['user1@example.com', 'user2@example.com']);
    });

    afterEach(() => {
      if (scheduler) {
        scheduler.stop();
      }
    });

    it('should create a scheduler instance', () => {
      scheduler = new DeadlineNotificationScheduler();
      expect(scheduler).toBeDefined();
    });

    it('should send notification on 30-day threshold', async () => {
      const dateProvider = () => new Date(2025, 3, 1, 9, 0, 0); // April 1, 9 AM
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      const notification = await scheduler.runCheck();
      
      expect(notification).not.toBeNull();
      expect(notification.threshold_days).toBe(30);
      expect(mockSender).toHaveBeenCalledTimes(1);
      expect(mockRecipientProvider).toHaveBeenCalled();
    });

    it('should send notification on 7-day threshold', async () => {
      const dateProvider = () => new Date(2025, 3, 24, 9, 0, 0); // April 24
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      const notification = await scheduler.runCheck();
      
      expect(notification).not.toBeNull();
      expect(notification.threshold_days).toBe(7);
    });

    it('should send notification on 1-day threshold', async () => {
      const dateProvider = () => new Date(2025, 3, 30, 9, 0, 0); // April 30
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      const notification = await scheduler.runCheck();
      
      expect(notification).not.toBeNull();
      expect(notification.threshold_days).toBe(1);
    });

    it('should not send notification on non-threshold days', async () => {
      const dateProvider = () => new Date(2025, 3, 15, 9, 0, 0); // April 15
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      const notification = await scheduler.runCheck();
      
      expect(notification).toBeNull();
      expect(mockSender).not.toHaveBeenCalled();
    });

    it('should not duplicate notifications for same threshold', async () => {
      const dateProvider = () => new Date(2025, 3, 1, 9, 0, 0);
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      // First check - should send
      await scheduler.runCheck();
      expect(mockSender).toHaveBeenCalledTimes(1);

      // Second check - should not duplicate
      await scheduler.runCheck();
      expect(mockSender).toHaveBeenCalledTimes(1);
    });

    it('should include recipients in notification', async () => {
      const dateProvider = () => new Date(2025, 3, 1, 9, 0, 0);
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      const notification = await scheduler.runCheck();
      
      expect(notification.recipients).toEqual(['user1@example.com', 'user2@example.com']);
    });

    it('should reset last notification threshold', async () => {
      const dateProvider = () => new Date(2025, 3, 1, 9, 0, 0);
      
      scheduler = new DeadlineNotificationScheduler({
        notificationSender: mockSender,
        recipientProvider: mockRecipientProvider,
        dateProvider
      });

      await scheduler.runCheck();
      expect(mockSender).toHaveBeenCalledTimes(1);

      scheduler.reset();

      await scheduler.runCheck();
      expect(mockSender).toHaveBeenCalledTimes(2);
    });
  });

  describe('NOTIFICATION_THRESHOLDS', () => {
    it('should contain 30, 7, and 1 day thresholds', () => {
      expect(NOTIFICATION_THRESHOLDS).toContain(30);
      expect(NOTIFICATION_THRESHOLDS).toContain(7);
      expect(NOTIFICATION_THRESHOLDS).toContain(1);
    });
  });
});
