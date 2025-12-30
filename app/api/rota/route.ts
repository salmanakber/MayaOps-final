import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { validateAssignment, getCleanerWorkload } from "@/lib/rota-conflicts"

// GET /api/rota - Get rota for a week
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole
  const { searchParams } = new URL(request.url)

  const weekStart = searchParams.get("weekStart")
  const weekEnd = searchParams.get("weekEnd")
  const companyIdParam = searchParams.get("companyId") || tokenUser.companyId

  
  try {
    let companyId: number | null = null
    if (role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      companyId = companyIdParam ? Number(companyIdParam) : null
    } else {
      companyId = requireCompanyScope(tokenUser)
      if (!companyId) return NextResponse.json({ success: false, message: "No company scope" }, { status: 403 })
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
            requiredSkills: {
              include: { skill: true },
            },
          },
        },
        assignedUser: { 
          select: { 
            id: true, 
            email: true, 
            firstName: true, 
            lastName: true,
            profileImage: true,
            cleanerSkills: {
              include: { skill: true },
            },
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
                profileImage: true,
                cleanerSkills: {
                  include: { skill: true },
                },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    })

    // Get all active cleaners for the company with workload and availability
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
        maxWorkingHours: true,
        profileImage: true,
        cleanerSkills: {
          include: { skill: true },
        },
      },
    })

    // Calculate workload for each cleaner (tasks assigned in the week)
    // Enhanced: Include hours worked for better workload balancing
    const weekStartDate = weekStart ? new Date(weekStart) : undefined;
    const weekEndDate = weekEnd ? new Date(weekEnd) : undefined;

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
            estimatedDurationMinutes: true,
          },
        });

        const taskCount = weekTasks.length;
        const hoursWorked = weekTasks.reduce((sum, task) => {
          return sum + (task.estimatedDurationMinutes || 120) / 60;
        }, 0);

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
          // Task count stats (backward compatible)
          average: cleanerWorkloads.length > 0 
            ? cleanerWorkloads.reduce((sum, c) => sum + c.taskCount, 0) / cleanerWorkloads.length 
            : 0,
          max: Math.max(...cleanerWorkloads.map(c => c.taskCount), 0),
          min: Math.min(...cleanerWorkloads.map(c => c.taskCount), 0),
          // Enhanced: Hours worked stats (for workload balancing)
          averageHours: cleanerWorkloads.length > 0
            ? cleanerWorkloads.reduce((sum, c) => sum + c.hoursWorked, 0) / cleanerWorkloads.length
            : 0,
          maxHours: Math.max(...cleanerWorkloads.map(c => c.hoursWorked), 0),
          minHours: Math.min(...cleanerWorkloads.map(c => c.hoursWorked), 0),
        },
      },
    })
  } catch (error) {
    console.error("Rota GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// POST /api/rota/assign
// Assign task to cleaner
// Enhanced: Includes conflict detection and validation (non-blocking warnings)
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Access control: Only Owner and Manager can assign
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { taskId, assignedUserId, scheduledDate, ignoreWarnings } = body

    if (!taskId || !assignedUserId) {
      return NextResponse.json({ success: false, message: "taskId and assignedUserId are required" }, { status: 400 })
    }

    // Get full task details including property for validation
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: {
        property: {
          include: {
            requiredSkills: {
              include: { skill: true },
            },
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 })
    }

    // Verify cleaner belongs to same company
    const cleaner = await prisma.user.findFirst({
      where: {
        id: Number(assignedUserId),
        role: UserRole.CLEANER,
        OR: [{ companyId: task.companyId }, { role: { in: [UserRole.OWNER, UserRole.DEVELOPER] } }],
      },
    })

    if (!cleaner) {
      return NextResponse.json({ success: false, message: "Cleaner not found or not in company" }, { status: 404 })
    }

    // Enhanced: Validate assignment and detect conflicts
    const taskScheduledDate = scheduledDate ? new Date(scheduledDate) : (task.scheduledDate || new Date());
    
    // Calculate week boundaries for max hours validation
    const date = new Date(taskScheduledDate);
    const day = date.getDay();
    const diff = date.getDate() - day;
    const weekStart = new Date(date.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const validation = await validateAssignment(
      cleaner.id,
      task.id,
      taskScheduledDate,
      task.propertyId,
      task.estimatedDurationMinutes,
      weekStart,
      weekEnd
    );

    // Return warnings even if assignment proceeds (non-blocking)
    // This allows the frontend to show warnings to the manager

    const updateData: any = { assignedUserId: Number(assignedUserId), status: "ASSIGNED" }
    if (scheduledDate) updateData.scheduledDate = taskScheduledDate

    const updatedTask = await prisma.task.update({
      where: { id: Number(taskId) },
      data: updateData,
      include: {
        property: true,
        assignedUser: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true,
            cleanerSkills: {
              include: { skill: true },
            },
          },
        },
      },
    })

    return NextResponse.json({ 
      success: true, 
      data: { 
        task: updatedTask,
        warnings: validation.warnings, // Include warnings in response
      },
    })
  } catch (error) {
    console.error("Rota POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

