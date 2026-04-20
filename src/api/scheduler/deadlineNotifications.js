/**
 * Deadline Notification Scheduler
 * 
 * Scheduled job (cron) that sends warning notifications before the May 1 deadline.
 * Notification thresholds: 30 days, 7 days, 1 day before May 1.
 * 
 * @module scheduler/deadlineNotifications
 */

const { 
  getDaysUntilDeadline, 
  getNotificationThreshold, 
  getDeadlineStatus,
  NOTIFICATION_THRESHOLDS 
} = require('../utils/deadline');

/**
 * Notification callback type.
 * @callback NotificationCallback
 * @param {Object} notification - Notification details
 * @param {string} notification.type - Notification type (e.g., 'deadline_warning')
 * @param {number} notification.days_remaining - Days until deadline
 * @param {string} notification.message - Human-readable warning message
 * @param {Object} notification.deadline_status - Full deadline status
 * @param {string[]} notification.recipients - List of recipient identifiers
 */

/**
 * Default notification sender (logs to console).
 * Replace with actual notification implementation (email, SMS, push, etc.)
 * 
 * @param {Object} notification - Notification details
 */
async function defaultNotificationSender(notification) {
  console.log('[DEADLINE NOTIFICATION]', JSON.stringify(notification, null, 2));
  // TODO: Integrate with actual notification services:
  // - Azure Communication Services for email/SMS
  // - Azure Notification Hub for push notifications
  // - Event Grid for webhook triggers
}

/**
 * Get warning message based on days remaining.
 * 
 * @param {number} daysRemaining - Days until deadline
 * @returns {string} - Warning message
 */
function getWarningMessage(daysRemaining) {
  if (daysRemaining === 30) {
    return 'Your Florida Annual Report is due in 30 days (May 1). ' +
           'Please complete your filing to avoid late fees.';
  }
  if (daysRemaining === 7) {
    return 'URGENT: Your Florida Annual Report is due in 7 days (May 1). ' +
           'Late filings incur a $400 penalty. Please file immediately.';
  }
  if (daysRemaining === 1) {
    return 'FINAL WARNING: Your Florida Annual Report is due TOMORROW (May 1). ' +
           'This is your last day to file without penalties. File now!';
  }
  return `Your Florida Annual Report deadline is in ${daysRemaining} days.`;
}

/**
 * Check if a notification should be sent and create the notification payload.
 * 
 * @param {Date} [date] - The date to check (defaults to now)
 * @returns {Object|null} - Notification payload or null if no notification needed
 */
function checkNotification(date) {
  const checkDate = date || new Date();
  const daysRemaining = getDaysUntilDeadline(checkDate);
  const threshold = getNotificationThreshold(daysRemaining);
  
  if (threshold === null) {
    return null;
  }
  
  return {
    type: 'deadline_warning',
    threshold_days: threshold,
    days_remaining: daysRemaining,
    message: getWarningMessage(daysRemaining),
    deadline_status: getDeadlineStatus(checkDate),
    created_at: checkDate.toISOString()
  };
}

/**
 * DeadlineNotificationScheduler class.
 * Manages the cron job for sending deadline warning notifications.
 */
class DeadlineNotificationScheduler {
  /**
   * Create a new scheduler instance.
   * 
   * @param {Object} options - Configuration options
   * @param {Function} [options.notificationSender] - Custom notification sender
   * @param {Function} [options.recipientProvider] - Function to get notification recipients
   * @param {Function} [options.dateProvider] - Function to get current date (for testing)
   */
  constructor(options = {}) {
    this.notificationSender = options.notificationSender || defaultNotificationSender;
    this.recipientProvider = options.recipientProvider || (() => ['all_users']);
    this.dateProvider = options.dateProvider || (() => new Date());
    this.intervalId = null;
    this.lastNotificationThreshold = null;
  }

  /**
   * Run a single check and send notifications if needed.
   * 
   * @returns {Object|null} - Sent notification or null
   */
  async runCheck() {
    const now = this.dateProvider();
    const notification = checkNotification(now);
    
    if (!notification) {
      return null;
    }
    
    // Prevent duplicate notifications for the same threshold
    if (this.lastNotificationThreshold === notification.threshold_days) {
      return null;
    }
    
    // Add recipients
    notification.recipients = await this.recipientProvider();
    
    // Send notification
    await this.notificationSender(notification);
    
    // Track last sent threshold
    this.lastNotificationThreshold = notification.threshold_days;
    
    return notification;
  }

  /**
   * Start the scheduler to run daily.
   * Checks once per day at the specified hour (default: 9 AM).
   * 
   * @param {number} [checkHour=9] - Hour of day to run check (0-23)
   */
  start(checkHour = 9) {
    // Calculate milliseconds until next check time
    const now = new Date();
    const nextCheck = new Date(now);
    nextCheck.setHours(checkHour, 0, 0, 0);
    
    if (nextCheck <= now) {
      nextCheck.setDate(nextCheck.getDate() + 1);
    }
    
    const msUntilNextCheck = nextCheck - now;
    
    // Schedule first check
    setTimeout(() => {
      this.runCheck();
      // Then run every 24 hours
      this.intervalId = setInterval(() => this.runCheck(), 24 * 60 * 60 * 1000);
    }, msUntilNextCheck);
    
    console.log(`[SCHEDULER] Deadline notification scheduler started. Next check at ${nextCheck.toISOString()}`);
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SCHEDULER] Deadline notification scheduler stopped.');
    }
  }

  /**
   * Reset the last notification threshold (for testing).
   */
  reset() {
    this.lastNotificationThreshold = null;
  }
}

module.exports = {
  DeadlineNotificationScheduler,
  checkNotification,
  getWarningMessage,
  defaultNotificationSender,
  NOTIFICATION_THRESHOLDS
};
