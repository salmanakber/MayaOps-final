/**
 * Test Webhook Endpoint
 * Allows testing if the webhook endpoint is accessible
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[Test Webhook] Received test request:', {
      body,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook endpoint is accessible',
      received: body,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Test Webhook] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Test webhook endpoint is active',
    webhookUrl: '/api/webhooks/google-drive',
    testUrl: '/api/watch/test-webhook',
    timestamp: new Date().toISOString(),
  });
}
