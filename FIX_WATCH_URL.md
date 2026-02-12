# Fix Watch Channel URL Issue

Your watch channels were created with `localhost:3000` instead of your ngrok URL. Here's how to fix it:

## Quick Fix

### Step 1: Verify Environment Variable

Make sure your `.env` file has:
```env
NEXT_PUBLIC_API_URL="https://your-ngrok-url.ngrok.io"
```

**Important**: Replace `your-ngrok-url.ngrok.io` with your actual ngrok URL (e.g., `https://abc123.ngrok.io`)

### Step 2: Restart Your Server

Restart your Next.js server so it picks up the new environment variable.

### Step 3: Recreate Watch Channels

You have two options:

#### Option A: Force Recreate All Watches
```bash
POST /api/watch/force-recreate
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{}
```

This will:
- Stop all existing watch channels
- Recreate them with the current webhook URL (from NEXT_PUBLIC_API_URL)

#### Option B: Recreate for Specific Company
```bash
POST /api/watch/setup-company
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "companyId": 1,
  "sheetType": "task"  // or "property"
}
```

### Step 4: Verify

After recreating, check the logs. You should see:
```
[Watch] Final webhook URL: https://your-ngrok-url.ngrok.io/api/webhooks/google-drive
```

**NOT**:
```
[Watch] Final webhook URL: https://localhost:3000/api/webhooks/google-drive
```

### Step 5: Test

After recreating, Google will immediately send a "sync" notification. You should see in logs:
```
[Webhook] ✅ Received sync notification from Google Drive
```

And the URL should be your ngrok URL, not localhost.

## Why This Happened

Watch channels store the webhook URL at creation time. If you:
1. Created the watch before setting NEXT_PUBLIC_API_URL
2. Changed your ngrok URL after creating the watch
3. Restarted ngrok (which changes the URL)

Then the watch channel still has the old URL. You need to recreate it.

## Prevention

- Always set `NEXT_PUBLIC_API_URL` before creating watch channels
- If your ngrok URL changes, run `/api/watch/force-recreate` to update all watches
- The system will now warn you if you try to create watches with localhost
