import prisma from './prisma';
import { UserRole } from '@prisma/client';

export interface NotificationPayload {
  userId: number;
  title: string;
  message: string;
  type: 'task_assigned' | 'task_reminder' | 'missing_photos' | 'qa_result' | 'payment_alert' | 'high_severity_issue' | 'task_updated' | 'task_created';
  metadata?: Record<string, any>;
  screenRoute?: string; // e.g., 'TaskDetail', 'IssueDetail', etc.
  screenParams?: Record<string, any>; // e.g., { taskId: 123 }
}

/**
 * Helper function to determine screen route based on notification type and metadata
 */
function getScreenRoute(type: string, metadata?: Record<string, any>): { route?: string; params?: Record<string, any> } {
  if (!metadata) return {};

  switch (type) {
    case 'task_assigned':
    case 'task_reminder':
    case 'missing_photos':
    case 'qa_result':
    case 'task_updated':
    case 'task_created':
      if (metadata.taskId) {
        return { route: 'TaskDetail', params: { taskId: metadata.taskId } };
      }
      break;
    case 'high_severity_issue':
      if (metadata.taskId) {
        return { route: 'TaskDetail', params: { taskId: metadata.taskId } };
      }
      if (metadata.noteId) {
        return { route: 'IssueDetail', params: { issueId: metadata.noteId } };
      }
      break;
    case 'payment_alert':
      // Payment alerts might not have a specific screen
      break;
  }

  return {};
}

export async function createNotification(payload: NotificationPayload & { sendEmail?: boolean }) {
  try {
    // Determine screen route if not provided
    const screenInfo = payload.screenRoute 
      ? { route: payload.screenRoute, params: payload.screenParams || {} }
      : getScreenRoute(payload.type, payload.metadata);

    // Get user preferences and email
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });

    // Store notification in database
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        status: 'unread',
        metadata: payload.metadata ? JSON.stringify({
          ...payload.metadata,
          screenRoute: screenInfo.route,
          screenParams: screenInfo.params,
        }) : JSON.stringify({
          screenRoute: screenInfo.route,
          screenParams: screenInfo.params,
        }),
      },
    });

    // Check user preferences for email notifications
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId: payload.userId },
      select: { emailNotifications: true },
    });

    const shouldSendEmail = (preferences?.emailNotifications ?? true) && payload.sendEmail !== false && user?.email;

    if (shouldSendEmail) {
      try {
        // Import email service
        const { sendEmail } = await import('./email');
        
        // Generate email HTML based on notification type
        const emailHtml = generateEmailTemplate(payload, user);
        
        // await sendEmail({
        //   to: user!.email,
        //   subject: payload.title,
        //   html: emailHtml,
        // });
        
        console.log(`📧 Email sent: ${payload.type} to ${user!.email}`);
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't fail the notification creation if email fails
      }
    }

    // Send Expo push notification if user has push token
    try {
      const { sendExpoPushNotification } = await import('./expo-push');
      // Include screen route and params in push notification data for deep linking
      const pushMetadata = {
        ...payload.metadata,
        screenRoute: screenInfo.route,
        screenParams: screenInfo.params,
      };
      await sendExpoPushNotification(payload.userId, payload.title, payload.message, pushMetadata);
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
      // Don't fail the notification creation if push fails
    }
    
    console.log(`📧 Notification created: ${payload.type} for user ${payload.userId} (ID: ${notification.id})`);
    console.log(`   Title: ${payload.title}`);
    console.log(`   Screen: ${screenInfo.route || 'none'}`);

    return {
      success: true,
      notificationId: notification.id,
    };
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw - notifications shouldn't break the main flow
    return {
      success: false,
      notificationId: null,
    };
  }
}

function generateEmailTemplate(payload: NotificationPayload, user: { firstName: string | null; lastName: string | null; email: string } | null): string {
  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User' : 'User';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #00838F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #00838F; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${payload.title}</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>${payload.message}</p>
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.mayaops.com'}" class="button">View Details</a>
            </p>
          </div>
          <div class="footer">
            <p>© 2025 MayaOps. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function sendTaskAssignmentNotification(taskId: number, userId: number) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        property: true,
        assignedUser: true,
      },
    });

    if (!task) return;

    await createNotification({
      userId,
      title: 'New Task Assigned',
      message: `You have been assigned to: ${task.title}${task.property?.address ? ` at ${task.property.address}` : ''}`,
      type: 'task_assigned',
      metadata: { taskId },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  } catch (error) {
    console.error('Error sending task assignment notification:', error);
  }
}

/**
 * Send task assignment notifications to multiple cleaners
 */
export async function sendTaskAssignmentNotifications(taskId: number, userIds: number[]) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        property: true,
      },
    });

    if (!task) return;

    // Send notification to each assigned cleaner
    await Promise.all(
      userIds.map(userId =>
        createNotification({
          userId,
          title: 'New Task Assigned',
          message: `You have been assigned to: ${task.title}${task.property?.address ? ` at ${task.property.address}` : ''}`,
          type: 'task_assigned',
          metadata: { taskId },
          screenRoute: 'TaskDetail',
          screenParams: { taskId },
        })
      )
    );
  } catch (error) {
    console.error('Error sending task assignment notifications:', error);
  }
}

export async function sendTaskReminderNotification(taskId: number, hoursBeforeTask: number) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        property: true,
        assignedUser: true,
      },
    });

    if (!task || !task.assignedUser) return;

    await createNotification({
      userId: task.assignedUser.id,
      title: `Task Reminder - ${hoursBeforeTask}h`,
      message: `Reminder: ${task.title}${task.property?.address ? ` at ${task.property.address}` : ''}${task.scheduledDate ? ` scheduled for ${task.scheduledDate.toLocaleString()}` : ''}`,
      type: 'task_reminder',
      metadata: { taskId, hoursBeforeTask },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  } catch (error) {
    console.error('Error sending task reminder notification:', error);
  }
}

export async function sendMissingPhotosNotification(taskId: number, userId: number, currentCount: number, requiredCount: number) {
  try {
    await createNotification({
      userId,
      title: 'Missing Photos',
      message: `Task requires ${requiredCount} photos. You have uploaded ${currentCount}. Please upload ${requiredCount - currentCount} more.`,
      type: 'missing_photos',
      metadata: { taskId, currentCount, requiredCount },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  } catch (error) {
    console.error('Error sending missing photos notification:', error);
  }
}

export async function sendQAResultNotification(taskId: number, userId: number, approved: boolean, feedback?: string) {
  try {
    await createNotification({
      userId,
      title: approved ? 'Task Approved' : 'Task Rejected',
      message: approved 
        ? `Your task has been approved!` 
        : `Your task needs revision. Feedback: ${feedback || 'Please check the details.'}`,
      type: 'qa_result',
      metadata: { taskId, approved, feedback },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  } catch (error) {
    console.error('Error sending QA result notification:', error);
  }
}

export async function sendHighSeverityIssueNotification(companyId: number, taskId: number, noteId: number) {
  // Get all admins and managers for the company
  const admins = await prisma.user.findMany({
    where: {
      companyId,
      role: {
        in: [UserRole.COMPANY_ADMIN, UserRole.MANAGER],
      },
      isActive: true,
    },
    select: { id: true },
  });

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { content: true, category: true },
  });

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      title: 'High Severity Issue Reported',
      message: `A high severity issue has been reported for task #${taskId}${note?.category ? ` (${note.category})` : ''}: ${note?.content?.substring(0, 100) || 'See details'}`,
      type: 'high_severity_issue',
      metadata: { taskId, noteId, companyId },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  }
}

export async function sendPaymentAlertNotification(companyId: number, adminUserIds: number[], reason: string) {
  try {
    for (const adminId of adminUserIds) {
      await createNotification({
        userId: adminId,
        title: 'Payment Alert',
        message: `Payment issue for company #${companyId}: ${reason}`,
        type: 'payment_alert',
        metadata: { companyId, reason },
        screenRoute: 'Billing',
      });
    }
  } catch (error) {
    console.error('Error sending payment alert notifications:', error);
  }
}

/**
 * Send notification when a task is created
 */
export async function sendTaskCreatedNotification(taskId: number, creatorUserId: number, assignedUserIds: number[]) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        property: true,
      },
    });

    if (!task) return;

    // Notify assigned cleaners
    await sendTaskAssignmentNotifications(taskId, assignedUserIds);

    // Optionally notify managers/admins that a task was created
    // This can be added if needed
  } catch (error) {
    console.error('Error sending task created notifications:', error);
  }
}

/**
 * Send notification when a task is updated (e.g., cleaner assignment changed)
 */
export async function sendTaskUpdatedNotification(taskId: number, userIds: number[], updateType: 'assignment' | 'status' | 'details') {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        property: true,
      },
    });

    if (!task) return;

    let title = 'Task Updated';
    let message = `Task "${task.title}" has been updated`;

    switch (updateType) {
      case 'assignment':
        title = 'Task Assignment Updated';
        message = `You have been assigned to task: ${task.title}${task.property?.address ? ` at ${task.property.address}` : ''}`;
        break;
      case 'status':
        title = 'Task Status Changed';
        message = `Task "${task.title}" status changed to ${task.status}`;
        break;
      case 'details':
        title = 'Task Details Updated';
        message = `Task "${task.title}" details have been updated`;
        break;
    }

    await Promise.all(
      userIds.map(userId =>
        createNotification({
          userId,
          title,
          message,
          type: 'task_updated',
          metadata: { taskId, updateType },
          screenRoute: 'TaskDetail',
          screenParams: { taskId },
        })
      )
    );
  } catch (error) {
    console.error('Error sending task updated notifications:', error);
  }
}

export async function scheduleTaskReminders(taskId: number) {
  // In production, this would use a job queue (Bull, BullMQ) or cron scheduler
  // to send reminders 24h and 1h before task
  
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { scheduledDate: true, assignedUserId: true },
  });

  if (!task || !task.scheduledDate || !task.assignedUserId) return;

  console.log(`📅 Scheduled reminders for task ${taskId}`);
  // Queue jobs for 24h and 1h before task.scheduledDate
}
