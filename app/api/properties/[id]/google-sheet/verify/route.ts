import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { extractSpreadsheetId, verifyGoogleSheet, fetchSheetHeaders } from '@/lib/google-sheets-tasks';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { sheetUrl } = body;

    if (!sheetUrl) {
      return NextResponse.json({ success: false, message: 'Sheet URL is required' }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, message: 'Invalid Google Sheets URL' }, { status: 400 });
    }

    // Verify sheet access
    const sheetInfo = await verifyGoogleSheet(spreadsheetId);

    // Get headers from first sheet
    const firstSheet = sheetInfo.sheets[0];
    if (!firstSheet) {
      return NextResponse.json({ success: false, message: 'No sheets found in spreadsheet' }, { status: 400 });
    }

    const headers = await fetchSheetHeaders(spreadsheetId, firstSheet.title);

    return NextResponse.json({
      success: true,
      data: {
        spreadsheetId,
        spreadsheetTitle: sheetInfo.title,
        sheets: sheetInfo.sheets,
        headers,
        defaultSheet: firstSheet.title,
      },
    });
  } catch (error: any) {
    console.error('Error verifying Google Sheet:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to verify Google Sheet' 
    }, { status: 500 });
  }
}

