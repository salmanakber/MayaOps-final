import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { sendExpoPushNotification } from '@/lib/expo-push';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/admin/notifications/send
 * Send notifications to users by role (Admin/Company Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request);
    if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    // Only COMPANY_ADMIN, OWNER, DEVELOPER, and SUPER_ADMIN can send notifications
    if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { title, message, targetRole, companyId, userIds } = body;

    if (!title || !message) {
      return NextResponse.json({ success: false, error: 'Title and message are required' }, { status: 400 });
    }

    // Determine company scope
    let targetCompanyId: number | null = null;
    if (role === UserRole.SUPER_ADMIN || role === UserRole.DEVELOPER || role === UserRole.OWNER) {
      // Convert companyId to number if provided (handle both string and number)
      if (companyId !== null && companyId !== undefined && companyId !== '') {
        targetCompanyId = Number(companyId);
        if (isNaN(targetCompanyId)) {
          return NextResponse.json({ success: false, error: 'Invalid companyId' }, { status: 400 });
        }
        console.log(`🏢 Target company ID set to: ${targetCompanyId}`);
      } else {
        console.log('🌐 No company filter - sending to all companies');
      }
    } else if (role === UserRole.COMPANY_ADMIN) {
      targetCompanyId = tokenUser.companyId || null; // Must use their company
      if (!targetCompanyId) {
        return NextResponse.json({ success: false, error: 'No company scope' }, { status: 403 });
      }
      console.log(`🏢 Company admin sending to company: ${targetCompanyId}`);
    }

    // Build user query
    const where: any = { isActive: true };
    
    if (targetCompanyId !== null && targetCompanyId !== undefined) {
      where.companyId = targetCompanyId;
      console.log(`🔍 Filtering users by companyId: ${targetCompanyId}`);
    } else {
      console.log('🔍 No company filter applied');
    }
    
    if (targetRole && targetRole !== 'all' && targetRole !== 'ALL') {
      where.role = targetRole;
      console.log(`🔍 Filtering users by role: ${targetRole}`);
    } else {
      console.log('🔍 No role filter applied');
    }
    
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      where.id = { in: userIds.map((id: any) => Number(id)) };
      console.log(`🔍 Filtering users by userIds: ${userIds.join(', ')}`);
    }

    console.log('📊 Final where clause:', JSON.stringify(where, null, 2));

    // Get target users
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (users.length === 0) {
      return NextResponse.json({ success: false, error: 'No users found matching criteria' }, { status: 404 });
    }

    // Send notifications to all target users
    const results = [];
    console.log(`📤 Starting to send notifications to ${users.length} user(s)`);
    
    for (const user of users) {
      try {
        // Create in-app notification
        await createNotification({
          userId: user.id,
          title,
          message,
          type: 'task_assigned',
          metadata: { sentBy: tokenUser.userId, targetRole, companyId: targetCompanyId },
        });
        console.log(`✅ In-app notification created for user ${user.id} (${user.email})`);

        // Send push notification
        const pushSent = await sendExpoPushNotification(user.id, title, message, {
          type: 'announcement',
          sentBy: tokenUser.userId,
        });

        results.push({ 
          userId: user.id, 
          email: user.email,
          success: true, 
          pushSent 
        });
      } catch (error: any) {
        console.error(`❌ Error sending notification to user ${user.id} (${user.email}):`, error);
        console.error('Error details:', error.message);
        results.push({ 
          userId: user.id, 
          email: user.email,
          success: false, 
          error: error.message || String(error) 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      data: {
        sent: successCount,
        total: users.length,
        results,
      },
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({ success: false, error: 'Failed to send notifications' }, { status: 500 });
  }
}

