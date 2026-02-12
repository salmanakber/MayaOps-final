import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Cron endpoint to permanently delete accounts whose deletion requests have reached their scheduled date.
// This should be called by the internal cron scheduler (lib/cron-scheduler.ts) or an external cron.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'development-secret';

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Find pending requests whose scheduled deletion date has passed
    const pendingRequests = await prisma.accountDeletionRequest.findMany({
      where: {
        status: 'pending',
        scheduledDeletionAt: {
          lte: now,
        },
      },
      include: {
        user: true,
      },
    });

    const processedIds: number[] = [];
    const deletedUserIds: number[] = [];
    const deletedCompanyIds: number[] = [];
    const errors: Array<{ requestId: number; error: string }> = [];

    // Keep track of companies we've already deleted to avoid duplicate work
    const deletedCompanySet = new Set<number>();

    for (const req of pendingRequests) {
      try {
        // Safety: ensure user still exists
        const user = req.user;
        if (!user) {
          // Mark request as processed anyway
          await prisma.accountDeletionRequest.update({
            where: { id: req.id },
            data: {
              status: 'processed',
              processedAt: new Date(),
            },
          });
          processedIds.push(req.id);
          continue;
        }

        const companyId = user.companyId ?? null;

        // Delete company (and cascaded data) if present and not already deleted
        if (companyId && !deletedCompanySet.has(companyId)) {
          try {
            await prisma.company.delete({
              where: { id: companyId },
            });
            deletedCompanySet.add(companyId);
            deletedCompanyIds.push(companyId);
          } catch (companyError: any) {
            console.error(`Error deleting company ${companyId} for deletion request ${req.id}:`, companyError);
            errors.push({
              requestId: req.id,
              error: `Company delete failed: ${companyError.message || String(companyError)}`,
            });
            // Continue with user deletion even if company deletion fails
          }
        }

        // Delete the user account itself
        try {
          await prisma.user.delete({
            where: { id: user.id },
          });
          deletedUserIds.push(user.id);
        } catch (userError: any) {
          console.error(`Error deleting user ${user.id} for deletion request ${req.id}:`, userError);
          errors.push({
            requestId: req.id,
            error: `User delete failed: ${userError.message || String(userError)}`,
          });
          // Skip marking request processed if user deletion failed
          continue;
        }

        // Mark request as processed
        await prisma.accountDeletionRequest.update({
          where: { id: req.id },
          data: {
            status: 'processed',
            processedAt: new Date(),
          },
        });
        processedIds.push(req.id);
      } catch (err: any) {
        console.error(`Error processing account deletion request ${req.id}:`, err);
        errors.push({
          requestId: req.id,
          error: err.message || String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        requestsChecked: pendingRequests.length,
        requestsProcessed: processedIds.length,
        deletedUsers: deletedUserIds.length,
        deletedCompanies: deletedCompanyIds.length,
        errorCount: errors.length,
      },
      details: {
        processedRequestIds: processedIds,
        deletedUserIds,
        deletedCompanyIds,
        errors,
      },
    });
  } catch (error: any) {
    console.error('Error in account deletion cron:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to process account deletions' },
      { status: 500 }
    );
  }
}

