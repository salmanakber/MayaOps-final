import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

/**
 * DELETE /api/properties/[id]/required-skills/[skillId]
 * Remove a required skill from a property
 * Only Owner, Manager, and Company Admin can manage property skills
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
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
    const { id, skillId } = await params

    await prisma.propertyRequiredSkill.delete({
      where: {
        propertyId_skillId: {
          propertyId: Number(id),
          skillId: Number(skillId),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Required skill removed from property",
    })
  } catch (error) {
    console.error("Property required skills DELETE error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

