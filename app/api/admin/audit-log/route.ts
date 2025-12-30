import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    
    const { tokenUser } = auth
    const role = tokenUser.role as UserRole

    // Allow SUPER_ADMIN, OWNER, DEVELOPER, and COMPANY_ADMIN
    if (
      role !== UserRole.SUPER_ADMIN &&
      role !== UserRole.OWNER &&
      role !== UserRole.DEVELOPER &&
      role !== UserRole.COMPANY_ADMIN
    ) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const companyIdParam = searchParams.get("companyId")
    const action = searchParams.get("action")
    const limit = parseInt(searchParams.get("limit") || "100")

    // Determine company ID based on role
    let companyId: number | null = null
    if (role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.DEVELOPER) {
      // Global roles can view any company's audit logs
      companyId = companyIdParam ? parseInt(companyIdParam) : (tokenUser.companyId || null)
    } else {
      // Others can only view their own company's audit logs
      companyId = tokenUser.companyId || null
    }

    if (!companyId) {
      return NextResponse.json({ success: false, error: "Company ID required" }, { status: 400 })
    }

    // Build where clause
    const where: any = { companyId }
    if (action) {
      where.action = action
    }

    // Fetch audit logs using Prisma
    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    // Format response
    const formattedLogs = auditLogs.map(log => ({
      id: log.id,
      companyId: log.companyId,
      userId: log.userId,
      user: log.user ? {
        id: log.user.id,
        firstName: log.user.firstName,
        lastName: log.user.lastName,
        email: log.user.email,
      } : null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ? String(log.entityId) : null,
      oldValues: log.oldValues ? (typeof log.oldValues === 'string' ? JSON.parse(log.oldValues) : log.oldValues) : null,
      newValues: log.newValues ? (typeof log.newValues === 'string' ? JSON.parse(log.newValues) : log.newValues) : null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: formattedLogs,
    })
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch audit logs" }, { status: 500 })
  }
}

// Log an action to audit trail
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

    const { companyId, userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent } =
      await request.json()

    if (!companyId || !userId || !action || !entityType) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Create audit log using Prisma
    await prisma.auditLog.create({
      data: {
        companyId: parseInt(companyId),
        userId: parseInt(userId),
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        oldValues: oldValues ? (typeof oldValues === 'string' ? oldValues : JSON.stringify(oldValues)) : null,
        newValues: newValues ? (typeof newValues === 'string' ? newValues : JSON.stringify(newValues)) : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error logging audit:", error)
    return NextResponse.json({ success: false, error: "Failed to log audit" }, { status: 500 })
  }
}
