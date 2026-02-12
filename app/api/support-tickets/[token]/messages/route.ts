import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

// GET /api/support-tickets/[token]/messages
// Public endpoint: fetch ticket info + messages using the public token.
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Ticket token is required' },
        { status: 400 }
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { publicToken: token },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        email: ticket.email,
        name: ticket.name,
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvedAt,
        messages: ticket.messages,
      },
    });
  } catch (error) {
    console.error('Error fetching ticket messages:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch ticket messages' },
      { status: 500 }
    );
  }
}

// POST /api/support-tickets/[token]/messages
// Public endpoint: add a reply from the customer side to an existing ticket.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Ticket token is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { message } = body || {};

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { success: false, message: 'Message is required' },
        { status: 400 }
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { publicToken: token },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 }
      );
    }

    const trimmedMessage = String(message).trim();

    // Create message as user reply and re-open ticket if it was closed
    const createdMessage = await prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        author: 'user',
        message: trimmedMessage,
      },
    });

    if (ticket.status === 'closed') {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'open', resolvedAt: null },
      });
    }

    // Notify internal support via email about the new customer reply
    const supportEmail =
      process.env.SUPPORT_EMAIL ||
      process.env.EMAIL_SUPPORT ||
      process.env.EMAIL_FROM ||
      'support@mayaops.com';

    try {
      await sendEmail({
        to: supportEmail,
        subject: `Customer replied on Support Ticket #${ticket.id}: ${ticket.subject}`,
        html: `
          <h2>Customer Reply on Support Ticket</h2>
          <p><strong>From:</strong> ${ticket.name ? `${ticket.name} &lt;${ticket.email}&gt;` : ticket.email}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Reply:</strong></p>
          <p>${trimmedMessage.replace(/\n/g, '<br />')}</p>
          <p><strong>Ticket ID:</strong> ${ticket.id}</p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send internal notification for customer reply:', emailError);
    }

    return NextResponse.json({
      success: true,
      data: createdMessage,
    });
  } catch (error) {
    console.error('Error creating ticket message:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create ticket message' },
      { status: 500 }
    );
  }
}

