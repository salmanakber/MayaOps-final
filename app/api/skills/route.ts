import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

/**
 * GET /api/skills
 * Get all available skills (catalog)
 * Accessible to all authenticated users (read-only)
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const skills = await prisma.skill.findMany({
      orderBy: { name: "asc" },
    })

    return NextResponse.json({
      success: true,
      data: { skills },
    })
  } catch (error) {
    console.error("Skills GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/skills
 * Create a new skill (catalog entry)
 * Only Owner, Manager, and Company Admin can create skills
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Access control: Only Owner, Manager, and Company Admin can create skills
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { name, description, category } = body

    if (!name) {
      return NextResponse.json({ success: false, message: "name is required" }, { status: 400 })
    }

    // Check if skill already exists
    const existing = await prisma.skill.findUnique({
      where: { name },
    })

    if (existing) {
      return NextResponse.json({ success: false, message: "Skill already exists" }, { status: 409 })
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        description,
        category,
      },
    })

    return NextResponse.json({
      success: true,
      data: { skill },
    }, { status: 201 })
  } catch (error) {
    console.error("Skills POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

