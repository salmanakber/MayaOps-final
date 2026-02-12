import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

// POST /api/support-tickets
// Public endpoint: create a support ticket from the public support form.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, subject, message } = body || {};

    if (!email || !subject || !message) {
      return NextResponse.json(
        { success: false, message: 'Email, subject, and message are required.' },
        { status: 400 }
      );
    }

    const trimmedEmail = String(email).trim();
    const trimmedSubject = String(subject).trim();
    const trimmedMessage = String(message).trim();
    const trimmedName = name ? String(name).trim() : null;

    if (!trimmedEmail || !trimmedSubject || !trimmedMessage) {
      return NextResponse.json(
        { success: false, message: 'Email, subject, and message cannot be empty.' },
        { status: 400 }
      );
    }

    // Generate a public token so the customer can view/reply to this ticket via a link
    const publicToken = crypto.randomBytes(24).toString('hex');

    // Store ticket and initial message in database
    const ticket = await prisma.supportTicket.create({
      data: {
        email: trimmedEmail,
        name: trimmedName || null,
        subject: trimmedSubject,
        publicToken,
        messages: {
          create: {
            author: 'user',
            message: trimmedMessage,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    // Optionally notify internal support via email (if configured)
    const supportEmail =
      process.env.SUPPORT_EMAIL ||
      process.env.EMAIL_SUPPORT ||
      process.env.EMAIL_FROM ||
      'support@mayaops.com';

    const webBaseUrl =
      process.env.NEXT_PUBLIC_WEB_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://app.mayaops.com';
    const publicTicketUrl = `${webBaseUrl.replace(/\/+$/, '')}/support/ticket/${ticket.publicToken}`;

    try {
      await sendEmail({
        to: supportEmail,
        subject: `New Support Ticket: ${trimmedSubject}`,
        html: `
          <h2>New Support Ticket</h2>
          <p><strong>From:</strong> ${trimmedName ? `${trimmedName} &lt;${trimmedEmail}&gt;` : trimmedEmail}</p>
          <p><strong>Subject:</strong> ${trimmedSubject}</p>
          <p><strong>Message:</strong></p>
          <p>${trimmedMessage.replace(/\n/g, '<br />')}</p>
          <p><strong>Ticket ID:</strong> ${ticket.id}</p>
          <p><strong>Created At:</strong> ${ticket.createdAt.toISOString()}</p>
          <p><strong>Customer View:</strong> <a href="${publicTicketUrl}">${publicTicketUrl}</a></p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send support ticket email notification:', emailError);
      // Do not fail the request if email notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Your support request has been submitted. Our team will get back to you soon.',
      data: { id: ticket.id, publicToken: ticket.publicToken },
    });
  } catch (error) {
    console.error('Support ticket creation error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

