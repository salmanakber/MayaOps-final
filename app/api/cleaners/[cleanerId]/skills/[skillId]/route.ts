import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth } from "@/lib/rbac"
import { UserRole } from "@prisma/client"

/**
 * DELETE /api/cleaners/[cleanerId]/skills/[skillId]
 * Remove a skill from a cleaner
 * Only Owner, Manager, and Company Admin can manage cleaner skills
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cleanerId: string; skillId: string }> }
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
    const { cleanerId, skillId } = await params

    await prisma.cleanerSkill.delete({
      where: {
        userId_skillId: {
          userId: Number(cleanerId),
          skillId: Number(skillId),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Skill removed from cleaner",
    })
  } catch (error) {
    console.error("Cleaner skills DELETE error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

