import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAuth, requireCompanyScope } from "@/lib/rbac"
import { UserRole } from "@prisma/client"
import { fetchSheetData, fetchSheetHeaders, parsePropertyRows, appendValidationReport, ColumnMapping } from "@/lib/sheets"
import { geocodeAddress } from "@/lib/geocoding"

// POST /api/sheets/sync/headers - Get sheet headers for mapping
export async function PUT(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { spreadsheetId, range } = body

    if (!spreadsheetId || !range) {
      return NextResponse.json({ success: false, message: "spreadsheetId and range are required" }, { status: 400 })
    }

    // Fetch headers from Google Sheets (first row of the range)
    const headers = await fetchSheetHeaders(spreadsheetId, range)

    return NextResponse.json({
      success: true,
      data: { headers },
    })
  } catch (error: any) {
    console.error("Error fetching sheet headers:", error)
    const errorMessage = error?.message || "Failed to fetch sheet headers. Please ensure the spreadsheet is shared with the service account and the range is correct."
    return NextResponse.json({ 
      success: false, 
      message: errorMessage 
    }, { status: 500 })
  }
}

// POST /api/sheets/sync
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { tokenUser } = auth
  const role = tokenUser.role as UserRole

  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN && role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json({ success: false, message: "Not authorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { spreadsheetId, range, companyId: bodyCompanyId, columnMapping } = body

    if (!spreadsheetId || !range) {
      return NextResponse.json({ success: false, message: "spreadsheetId and range are required" }, { status: 400 })
    }

    

    if (!columnMapping || !columnMapping.Address) {
      return NextResponse.json({ success: false, message: "Column mapping with address field is required" }, { status: 400 })
    }

    let companyId: number | null = null
    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      companyId = (bodyCompanyId)
    } else {
      companyId = requireCompanyScope(tokenUser)
    }

    console.log("companyI ssd", companyId)
    if (!companyId) {
      return NextResponse.json({ success: false, message: "Invalid company" }, { status: 400 })
    }

    // Fetch data from Google Sheets
    const sheetRows = await fetchSheetData(spreadsheetId, range)

    if (sheetRows.length === 0) {
      return NextResponse.json({ success: false, message: "No data found in sheet" }, { status: 400 })
    }

    // Get headers (first row)
    const headerRow = sheetRows[0] || []

    // Parse and validate rows with column mapping
    const { properties, errors } = parsePropertyRows(sheetRows, columnMapping as ColumnMapping, headerRow)

    // Save validation errors to report
    if (errors.length > 0) {
      try {
        await appendValidationReport(spreadsheetId, errors)
      } catch (error) {
        console.error("Error appending report:", error)
      }
    }

    // Create or update properties in database
    let createdCount = 0
    let updatedCount = 0
    let geocodedCount = 0

    for (const property of properties) {
      try {
        // Geocode if lat/lon are missing
        let latitude = property.latitude
        let longitude = property.longitude

        if ((!latitude || !longitude) && property.address) {
          const geocodeResult = await geocodeAddress(property.address, property.postcode || undefined)
          if (geocodeResult) {
            latitude = geocodeResult.lat
            longitude = geocodeResult.lng
            geocodedCount++
          }
        }

        const existingProperty = await prisma.property.findFirst({
          where: {
            companyId,
            address: property.address,
            postcode: property.postcode || null,
          },
        })

        if (existingProperty) {
          await prisma.property.update({
            where: { id: existingProperty.id },
            data: {
              notes: property.notes,
              latitude: latitude || existingProperty.latitude,
              longitude: longitude || existingProperty.longitude,
              propertyType: property.propertyType || existingProperty.propertyType,
            },
          })
          updatedCount++
        } else {
          await prisma.property.create({
            data: {
              companyId,
              address: property.address,
              postcode: property.postcode || null,
              latitude: latitude || null,
              longitude: longitude || null,
              propertyType: property.propertyType || "apartment",
              notes: property.notes || null,
              isActive: true,
            },
          })
          createdCount++
        }

        // Create task for cleaning date if provided
        if (property.cleaningDate) {
          const propertyRecord = await prisma.property.findFirst({
            where: {
              companyId,
              address: property.address,
              postcode: property.postcode || null,
            },
          })

          if (propertyRecord) {
            await prisma.task.create({
              data: {
                companyId,
                propertyId: propertyRecord.id,
                title: `Cleaning: ${property.address}`,
                description: property.notes || null,
                scheduledDate: new Date(property.cleaningDate),
                status: "PLANNED",
              },
            })
          }
        }
      } catch (error) {
        console.error("Error processing property:", error)
      }
    }

    // Update company property count
    const totalProperties = await prisma.property.count({ where: { companyId } })
    await prisma.company.update({
      where: { id: companyId },
      data: { propertyCount: totalProperties },
    })

    return NextResponse.json({
      success: true,
      data: {
        createdProperties: createdCount,
        updatedProperties: updatedCount,
        geocodedAddresses: geocodedCount,
        errors: errors.length,
        totalProcessed: properties.length,
      },
    })
  } catch (error) {
    console.error("Sheets sync error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}

// GET /api/sheets/sync - Get sync status
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get("companyId")

    if (!companyId) {
      return NextResponse.json({ success: false, message: "companyId is required" }, { status: 400 })
    }

    // Get recent syncs (tasks created recently from sheets)
    const recentTasks = await prisma.task.findMany({
      where: {
        companyId: Number(companyId),
        status: "PLANNED",
        title: { startsWith: "Cleaning:" },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    const totalSheetTasks = await prisma.task.count({
      where: {
        companyId: Number(companyId),
        title: { startsWith: "Cleaning:" },
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        lastSyncTasks: recentTasks,
        totalSheetTasks,
        lastSync: recentTasks[0]?.createdAt || null,
      },
    })
  } catch (error) {
    console.error("Sheets sync status error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
