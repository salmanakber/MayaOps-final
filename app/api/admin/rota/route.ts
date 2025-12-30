import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

// GET /api/admin/rota - Get rota for admin panel (admin-only)
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Only allow admin roles
  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get("weekStart")
  const weekEnd = searchParams.get("weekEnd")
  const companyIdParam = searchParams.get("companyId")

  try {
    let companyId: number | null = null
    
    // SUPER_ADMIN, OWNER, DEVELOPER can view any company
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      companyId = companyIdParam ? Number(companyIdParam) : (tokenUser.companyId || null)
    } else {
      // COMPANY_ADMIN and MANAGER can only view their own company
      companyId = tokenUser.companyId || null
    }
    
    if (!companyId) {
      return NextResponse.json({ success: false, message: "Company ID required" }, { status: 400 })
    }

    const where: any = { companyId }
    if (weekStart && weekEnd) {
      where.scheduledDate = {
        gte: new Date(weekStart),
        lte: new Date(weekEnd),
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        property: { 
          select: { 
            id: true, 
            address: true,
          },
        },
        assignedUser: { 
          select: { 
            id: true, 
            email: true, 
            firstName: true, 
            lastName: true,
          },
        },
        taskAssignments: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    })

    // Get all active cleaners for the company with workload
    const cleaners = await prisma.user.findMany({
      where: {
        companyId,
        role: UserRole.CLEANER,
        isActive: true,
      },
      select: { 
        id: true, 
        email: true, 
        firstName: true, 
        lastName: true,
      },
    })

    // Calculate workload for each cleaner
    const weekStartDate = weekStart ? new Date(weekStart) : undefined
    const weekEndDate = weekEnd ? new Date(weekEnd) : undefined

    const cleanerWorkloads = await Promise.all(
      cleaners.map(async (cleaner) => {
        const weekTasks = await prisma.task.findMany({
          where: {
            companyId,
            assignedUserId: cleaner.id,
            scheduledDate: weekStartDate && weekEndDate ? {
              gte: weekStartDate,
              lte: weekEndDate,
            } : undefined,
            status: {
              in: ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "PLANNED"],
            },
          },
          select: {
            id: true,
            estimatedDurationMinutes: true,
          },
        })

        const taskCount = weekTasks.length
        const hoursWorked = weekTasks.reduce((sum, task) => {
          return sum + (task.estimatedDurationMinutes || 120) / 60
        }, 0)

        // Get availability for the cleaner
        const availability = await prisma.cleanerAvailability.findMany({
          where: { userId: cleaner.id },
        })

        // Check for leave requests
        const leaveRequests = await prisma.leaveRequest.findMany({
          where: {
            userId: cleaner.id,
            status: "approved",
            startDate: weekStartDate ? { lte: weekEndDate || new Date() } : undefined,
            endDate: weekStartDate ? { gte: weekStartDate } : undefined,
          },
        })

        return {
          ...cleaner,
          taskCount,
          hoursWorked: parseFloat(hoursWorked.toFixed(2)),
          workload: taskCount, // For backward compatibility
          availability,
          onLeave: leaveRequests.length > 0,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: { 
        tasks, 
        cleaners: cleanerWorkloads,
        workloadStats: {
          average: cleanerWorkloads.length > 0 
            ? cleanerWorkloads.reduce((sum, c) => sum + c.taskCount, 0) / cleanerWorkloads.length 
            : 0,
          max: Math.max(...cleanerWorkloads.map(c => c.taskCount), 0),
          min: Math.min(...cleanerWorkloads.map(c => c.taskCount), 0),
          averageHours: cleanerWorkloads.length > 0
            ? cleanerWorkloads.reduce((sum, c) => sum + c.hoursWorked, 0) / cleanerWorkloads.length
            : 0,
          maxHours: Math.max(...cleanerWorkloads.map(c => c.hoursWorked), 0),
          minHours: Math.min(...cleanerWorkloads.map(c => c.hoursWorked), 0),
        },
      },
    })
  } catch (error) {
    console.error("Admin Rota GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

