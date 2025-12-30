import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendTaskReminderNotification } from "@/lib/notifications"

// GET /api/cron/task-reminders
// Cron job to send 24h and 1h reminders before tasks
// Should be called every hour via Vercel Cron or similar
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
    const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Find tasks scheduled in 1 hour
    const oneHourTasks = await prisma.task.findMany({
      where: {
        scheduledDate: {
          gte: now,
          lte: oneHourLater,
        },
        status: {
          in: ["ASSIGNED", "PLANNED"],
        },
        assignedUserId: { not: null },
      },
      include: {
        assignedUser: true,
        property: true,
      },
    })

    // Find tasks scheduled in 24 hours
    const twentyFourHourTasks = await prisma.task.findMany({
      where: {
        scheduledDate: {
          gte: now,
          lte: twentyFourHoursLater,
        },
        status: {
          in: ["ASSIGNED", "PLANNED"],
        },
        assignedUserId: { not: null },
      },
      include: {
        assignedUser: true,
        property: true,
      },
    })

    const results = {
      oneHourReminders: [] as any[],
      twentyFourHourReminders: [] as any[],
      errors: [] as string[],
    }

    // Send 1-hour reminders
    for (const task of oneHourTasks) {
      if (!task.assignedUser || !task.scheduledDate) continue

      const hoursUntil = Math.round((task.scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60))
      
      // Only send if within 1-2 hour window (to avoid duplicates)
      if (hoursUntil >= 0.5 && hoursUntil <= 1.5) {
        try {
          // Check if user has active device token
          const hasActiveToken = await prisma.deviceToken.count({
            where: {
              userId: task.assignedUser.id,
              isActive: true,
            },
          });

          // sendTaskReminderNotification handles both push (if active tokens exist) and email via createNotification
          // It will only send push if user has active device tokens (handled by sendExpoPushNotification)
          // Email will be sent regardless (handled by createNotification based on user preferences)
          await sendTaskReminderNotification(task.id, 1)
          results.oneHourReminders.push({ 
            taskId: task.id, 
            userId: task.assignedUser.id,
            hasActiveToken: hasActiveToken > 0 
          })
        } catch (error) {
          results.errors.push(`Failed to send 1h reminder for task ${task.id}: ${error}`)
        }
      }
    }

    // Send 24-hour reminders
    for (const task of twentyFourHourTasks) {
      if (!task.assignedUser || !task.scheduledDate) continue

      const hoursUntil = Math.round((task.scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60))
      
      // Only send if within 23-25 hour window (to avoid duplicates)
      if (hoursUntil >= 23 && hoursUntil <= 25) {
        try {
          // Check if user has active device token
          const hasActiveToken = await prisma.deviceToken.count({
            where: {
              userId: task.assignedUser.id,
              isActive: true,
            },
          });

          // sendTaskReminderNotification handles both push (if active tokens exist) and email via createNotification
          // It will only send push if user has active device tokens (handled by sendExpoPushNotification)
          // Email will be sent regardless (handled by createNotification based on user preferences)
          await sendTaskReminderNotification(task.id, 24)
          results.twentyFourHourReminders.push({ 
            taskId: task.id, 
            userId: task.assignedUser.id,
            hasActiveToken: hasActiveToken > 0 
          })
        } catch (error) {
          results.errors.push(`Failed to send 24h reminder for task ${task.id}: ${error}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        summary: {
          oneHourCount: results.oneHourReminders.length,
          twentyFourHourCount: results.twentyFourHourReminders.length,
          errorCount: results.errors.length,
        },
      },
    })
  } catch (error) {
    console.error("Task reminders cron error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}



