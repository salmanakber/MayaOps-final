import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/greeting
 * Simple greeting endpoint for mobile app
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || 'Guest';

    return NextResponse.json({
      success: true,
      message: `Welcome to MayaOps, ${name}!`,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }, { status: 200 });
  } catch (error) {
    console.error('Error in greeting endpoint:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * POST /api/greeting
 * Greeting endpoint with body data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, role } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        message: 'Name is required'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Hello ${name}${role ? ` (${role})` : ''}! Welcome to MayaOps Cleaning Management Platform.`,
      timestamp: new Date().toISOString(),
      data: {
        name,
        role: role || 'user',
        features: [
          'Task Management',
          'Photo Evidence',
          'PDF Reports',
          'Rota Builder',
          'Recurring Jobs'
        ]
      }
    }, { status: 200 });
  } catch (error) {
    console.error('Error in greeting POST endpoint:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
