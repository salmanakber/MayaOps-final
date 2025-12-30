import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

/**
 * GET /api/cleaners/[cleanerId]/skills
 * Get all skills for a cleaner
 * Accessible to all authenticated users
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cleanerId: string }> }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { cleanerId } = await params

    const cleanerSkills = await prisma.cleanerSkill.findMany({
      where: { userId: Number(cleanerId) },
      include: {
        skill: true,
      },
      orderBy: {
        skill: { name: "asc" },
      },
    })

    return NextResponse.json({
      success: true,
      data: { skills: cleanerSkills },
    })
  } catch (error) {
    console.error("Cleaner skills GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/cleaners/[cleanerId]/skills
 * Add a skill to a cleaner
 * Only Owner, Manager, and Company Admin can manage cleaner skills
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cleanerId: string }> }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Access control: Only Owner, Manager, and Company Admin can manage skills
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const { cleanerId } = await params
    const body = await request.json()
    const { skillId, proficiencyLevel } = body

    if (!skillId) {
      return NextResponse.json({ success: false, message: "skillId is required" }, { status: 400 })
    }

    // Verify cleaner exists and is a cleaner
    const cleaner = await prisma.user.findUnique({
      where: { id: Number(cleanerId) },
      select: { id: true, role: true },
    })

    if (!cleaner || cleaner.role !== UserRole.CLEANER) {
      return NextResponse.json({ success: false, message: "Cleaner not found" }, { status: 404 })
    }

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: Number(skillId) },
    })

    if (!skill) {
      return NextResponse.json({ success: false, message: "Skill not found" }, { status: 404 })
    }

    // Check if already exists (upsert)
    const cleanerSkill = await prisma.cleanerSkill.upsert({
      where: {
        userId_skillId: {
          userId: Number(cleanerId),
          skillId: Number(skillId),
        },
      },
      update: {
        proficiencyLevel,
      },
      create: {
        userId: Number(cleanerId),
        skillId: Number(skillId),
        proficiencyLevel,
      },
      include: {
        skill: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: { cleanerSkill },
    }, { status: 201 })
  } catch (error) {
    console.error("Cleaner skills POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}


