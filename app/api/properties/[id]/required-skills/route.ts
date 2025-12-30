import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

/**
 * GET /api/properties/[id]/required-skills
 * Get all required skills for a property
 * Accessible to all authenticated users
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params

    const propertySkills = await prisma.propertyRequiredSkill.findMany({
      where: { propertyId: Number(id) },
      include: {
        skill: true,
      },
      orderBy: {
        skill: { name: "asc" },
      },
    })

    return NextResponse.json({
      success: true,
      data: { skills: propertySkills },
    })
  } catch (error) {
    console.error("Property required skills GET error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/properties/[id]/required-skills
 * Add a required skill to a property
 * Only Owner, Manager, and Company Admin can manage property skills
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  // Access control: Only Owner, Manager, and Company Admin can manage property skills
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.MANAGER && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { skillId, isRequired = true } = body

    if (!skillId) {
      return NextResponse.json({ success: false, message: "skillId is required" }, { status: 400 })
    }

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: Number(id) },
    })

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 })
    }

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { id: Number(skillId) },
    })

    if (!skill) {
      return NextResponse.json({ success: false, message: "Skill not found" }, { status: 404 })
    }

    // Upsert (update if exists, create if not)
    const propertySkill = await prisma.propertyRequiredSkill.upsert({
      where: {
        propertyId_skillId: {
          propertyId: Number(id),
          skillId: Number(skillId),
        },
      },
      update: {
        isRequired,
      },
      create: {
        propertyId: Number(id),
        skillId: Number(skillId),
        isRequired,
      },
      include: {
        skill: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: { propertySkill },
    }, { status: 201 })
  } catch (error) {
    console.error("Property required skills POST error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}


