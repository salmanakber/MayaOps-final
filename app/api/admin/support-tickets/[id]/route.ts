import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { type NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

// PATCH /api/admin/support-tickets/[id]
// Update status and optionally send a reply email to the user.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireAuth(request);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const { tokenUser } = auth;
    const role = tokenUser.role as UserRole;

    if (
      role !== UserRole.SUPER_ADMIN &&
      role !== UserRole.OWNER &&
      role !== UserRole.DEVELOPER &&
      role !== UserRole.COMPANY_ADMIN &&
      role !== UserRole.MANAGER
    ) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const ticketId = parseInt(params.id, 10);
    if (Number.isNaN(ticketId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid ticket id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, replyMessage, sendEmail: shouldSendEmail } = body || {};

    // @ts-ignore - SupportTicket model exists in Prisma schema but Prisma client types may need regeneration
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Support ticket not found' },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (status && typeof status === 'string') {
      updateData.status = status;
      if (status === 'closed' && !ticket.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
    }

    // Update ticket status / timestamps
    // @ts-ignore - SupportTicket model exists in Prisma schema but Prisma client types may need regeneration
    const updatedTicket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    // If admin replied, create a message and send email with link to view ticket
    let createdMessage = null;
    if (replyMessage && typeof replyMessage === 'string' && replyMessage.trim()) {
      // @ts-ignore - SupportTicketMessage model exists in Prisma schema but Prisma client types may need regeneration
      createdMessage = await prisma.supportTicketMessage.create({
        data: {
          ticketId: ticketId,
          author: 'admin',
          message: replyMessage.trim(),
        },
      });

      if (shouldSendEmail) {
        // Ensure we have a publicToken for this ticket (older tickets may not have one)
        let publicToken = ticket.publicToken;
        if (!publicToken) {
          publicToken = crypto.randomBytes(24).toString('hex');
          // @ts-ignore - SupportTicket model exists in Prisma schema but Prisma client types may need regeneration
          await prisma.supportTicket.update({
            where: { id: ticket.id },
            data: { publicToken },
          });
        }

        const webBaseUrl =
          process.env.NEXT_PUBLIC_WEB_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'https://app.mayaops.com';
        const publicTicketUrl = `${webBaseUrl.replace(/\/+$/, '')}/support/ticket/${publicToken}`;

        const originalMessage =
          ticket.messages && ticket.messages.length > 0
            ? ticket.messages[0].message
            : '';

        try {
          await sendEmail({
            to: ticket.email,
            subject: `Re: ${ticket.subject}`,
            html: `
              <h2>Reply to your MayaOps support request</h2>
              <p>Hi${ticket.name ? ` ${ticket.name}` : ''},</p>
              <p>We have responded to your support request:</p>
              <p><strong>Original subject:</strong> ${ticket.subject}</p>
              ${originalMessage
                ? `<p><strong>First message you sent:</strong></p><p>${originalMessage.replace(/\n/g, '<br />')}</p>`
                : ''}
              <hr />
              <p><strong>Our latest reply:</strong></p>
              <p>${replyMessage.replace(/\n/g, '<br />')}</p>
              <p style="margin-top: 20px;">
                You can view the full conversation and reply directly here:
                <br />
                <a href="${publicTicketUrl}">${publicTicketUrl}</a>
              </p>
            `,
          });
        } catch (emailError) {
          console.error('Failed to send support ticket reply email:', emailError);
          // Do not fail the whole request if email fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ticket: updatedTicket,
        createdMessage,
      },
    });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update support ticket' },
      { status: 500 }
    );
  }
}

