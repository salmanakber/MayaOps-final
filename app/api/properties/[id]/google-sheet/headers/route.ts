import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { extractSpreadsheetId, fetchSheetHeaders } from '@/lib/google-sheets-tasks';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { sheetUrl, sheetName } = body;

    if (!sheetUrl) {
      return NextResponse.json({ success: false, message: 'Sheet URL is required' }, { status: 400 });
    }

    if (!sheetName) {
      return NextResponse.json({ success: false, message: 'Sheet name is required' }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, message: 'Invalid Google Sheets URL' }, { status: 400 });
    }

    // Fetch headers from the specified sheet
    const headers = await fetchSheetHeaders(spreadsheetId, sheetName);

    return NextResponse.json({
      success: true,
      data: {
        headers,
      },
    });
  } catch (error: any) {
    console.error('Error fetching sheet headers:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to fetch sheet headers' 
    }, { status: 500 });
  }
}
