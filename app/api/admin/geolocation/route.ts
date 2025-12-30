import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from "next/server"
import { UserRole } from '@prisma/client';

interface CoordinatePair {
  lat: number
  lng: number
}

function calculateDistance(coord1: CoordinatePair, coord2: CoordinatePair): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c * 1000 // Convert to meters
}

export async function POST(request: NextRequest) {
  try {
      const auth = requireAuth(request);
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    const { taskId, cleanerLat, cleanerLng, companyId } = await request.json()

    // Get task location
    const taskResult = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        property: {
          select: {
            latitude: true,
            longitude: true,
          },
        },
      },
    })

    if (!taskResult) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 })
    }

    // Get geofence radius from config
    const configResult = await prisma.adminConfiguration.findUnique({
      where: { companyId: companyId },
      select: {
        geofenceRadius: true,
      },
    })

    const geofenceRadius = configResult?.geofenceRadius || 150

    const taskLocation: CoordinatePair = {
      lat: taskResult.property.latitude,
      lng: taskResult.property.longitude,
    }
    const cleanerLocation: CoordinatePair = { lat: cleanerLat, lng: cleanerLng }

    const distance = calculateDistance(taskLocation, cleanerLocation)
    const isWithinGeofence = distance <= geofenceRadius

    // Log location check
    const locationLog = await prisma.locationLog.create({
      data: {
        taskId: taskId,
        userId: 0, // TODO: Add user ID
        latitude: cleanerLat,
        longitude: cleanerLng,
        distanceFromProperty: distance,
        withinGeofence: isWithinGeofence,
      },
    })

    return NextResponse.json({
      success: true,
      isWithinGeofence,
      distance,
      geofenceRadius,
    })
  } catch (error) {
    console.error("Error checking geolocation:", error)
    return NextResponse.json({ success: false, error: "Failed to check geolocation" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
      const auth = requireAuth(request);
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }
    const searchParams = request.nextUrl.searchParams
    const taskId = searchParams.get("taskId")

    const result = await prisma.locationLog.findMany({
      where: { taskId: Number(taskId) },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error fetching location logs:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch location logs" }, { status: 500 })
  }
}
