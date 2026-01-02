import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createNotification } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.SUPER_ADMIN && role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.COMPANY_ADMIN && role !== UserRole.MANAGER) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Get payroll record with user info
    const payrollRecord = await prisma.payrollRecord.findUnique({
      where: { id: Number(id) },
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
    });

    if (!payrollRecord) {
      return NextResponse.json({ success: false, message: 'Payroll record not found' }, { status: 404 });
    }

    const payroll = await prisma.payrollRecord.update({
      where: { id: Number(id) },
      data: {
        status,
        paidAt: status === 'paid' ? new Date() : null,
      },
    });

    // Update corresponding expense entry status to match payroll status
    try {
      // Find the expense entry for this payroll record
      // Match by userId, companyId, amount, category, and approximate date
      // We use a wider time window (5 minutes) to account for any delays
      const expense = await prisma.expense.findFirst({
        where: {
          userId: payrollRecord.userId,
          companyId: payrollRecord.companyId,
          category: 'Payroll',
          amount: payrollRecord.totalAmount,
          description: {
            contains: new Date(payrollRecord.periodStart).toLocaleDateString('en-GB'),
          },
          createdAt: {
            gte: new Date(new Date(payrollRecord.createdAt).getTime() - 5 * 60000), // Within 5 minutes of payroll creation
            lte: new Date(new Date(payrollRecord.createdAt).getTime() + 5 * 60000),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (expense) {
        // Map payroll status to expense status
        let expenseStatus = 'pending';
        if (status === 'approved') {
          expenseStatus = 'approved';
        } else if (status === 'paid') {
          expenseStatus = 'approved'; // Expenses are typically approved when paid
        }

        await prisma.expense.update({
          where: { id: expense.id },
          data: {
            status: expenseStatus,
            approvedBy: status !== 'pending' ? tokenUser.userId : null,
          },
        });

        console.log(`✅ Updated expense entry (ID: ${expense.id}) status to '${expenseStatus}' for payroll ${payroll.id}`);
      } else {
        console.warn(`⚠️ No matching expense entry found for payroll ${payroll.id} (userId: ${payrollRecord.userId}, amount: ${payrollRecord.totalAmount}, period: ${new Date(payrollRecord.periodStart).toLocaleDateString('en-GB')})`);
      }
    } catch (expenseError) {
      console.error('Error updating expense entry for payroll:', expenseError);
      // Don't fail the payroll update if expense update fails, but log it
    }

    // If payroll is marked as paid, update related working hours submissions to "paid" status
    if (status === 'paid' && payrollRecord.payrollType === 'hourly') {
      try {
        // Find all working hours submissions for this user in the payroll period
        const relatedSubmissions = await prisma.workingHoursSubmission.findMany({
          where: {
            userId: payrollRecord.userId,
            date: {
              gte: payrollRecord.periodStart,
              lte: payrollRecord.periodEnd,
            },
            status: { in: ['approved', 'pending'] }, // Only update approved/pending ones
          },
          select: {
            id: true,
          },
        });

        if (relatedSubmissions.length > 0) {
          // Update all related working hours submissions to "paid" status
          await prisma.workingHoursSubmission.updateMany({
            where: {
              id: { in: relatedSubmissions.map(s => s.id) },
            },
            data: {
              status: 'paid',
              // Note: approvedAt is preserved - we only update the status to track payment
            },
          });

          console.log(`✅ Updated ${relatedSubmissions.length} working hours submission(s) to paid status for payroll ${payroll.id}`);
        }
      } catch (hoursError) {
        console.error('Error updating working hours submissions to paid:', hoursError);
        // Don't fail the payroll update if hours update fails, but log it
      }
    }

    // Send notification to the employee
    let notificationTitle = 'Payroll Status Updated';
    let notificationMessage = 'Your payroll status has been updated';

    if (status === 'approved') {
      notificationTitle = 'Payroll Approved';
      notificationMessage = `Your payroll for the period ${new Date(payrollRecord.periodStart).toLocaleDateString('en-GB')} - ${new Date(payrollRecord.periodEnd).toLocaleDateString('en-GB')} has been approved. Amount: £${Number(payrollRecord.totalAmount).toFixed(2)}`;
    } else if (status === 'paid') {
      notificationTitle = 'Payment Received';
      notificationMessage = `Your payment of £${Number(payrollRecord.totalAmount).toFixed(2)} has been processed for the period ${new Date(payrollRecord.periodStart).toLocaleDateString('en-GB')} - ${new Date(payrollRecord.periodEnd).toLocaleDateString('en-GB')}`;
    }

    // Send notification asynchronously (don't fail the request if notification fails)
    createNotification({
      userId: payrollRecord.userId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'payment_alert',
      metadata: {
        payrollRecordId: payroll.id,
        status: status,
        amount: Number(payrollRecord.totalAmount),
      },
      screenRoute: 'Payroll',
      screenParams: { payrollRecordId: payroll.id },
    }).catch((notifError) => {
      console.error('Error sending payroll notification:', notifError);
      // Don't throw - notification failure shouldn't fail the approval
    });

    return NextResponse.json({ success: true, data: payroll });
  } catch (error: any) {
    console.error('Payroll approve error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
