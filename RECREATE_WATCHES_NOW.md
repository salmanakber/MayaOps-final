# ⚠️ URGENT: Recreate Watch Channels NOW

## The Problem

Even though you've hardcoded the ngrok URL in the code, **Google is still using the old watch channels** that were created with `localhost:3000`.

**Watch channels are stored in Google's system** - changing your code doesn't update them. You MUST recreate them.

## Immediate Action Required

### Step 1: Make sure your server is running with the new code

Restart your server so it has the updated `getWebhookUrl()` function.

### Step 2: Recreate ALL watch channels

Call this endpoint **RIGHT NOW** on your production server:

```bash
POST https://b38e-119-157-64-230.ngrok-free.app/api/watch/force-recreate
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{}
```

**OR** if you're testing locally, make sure your local server can reach the database and call:

```bash
POST http://localhost:3000/api/watch/force-recreate
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{}
```

### Step 3: Verify in logs

After calling the endpoint, check your logs. You should see:

```
[Watch] Final webhook URL: https://b38e-119-157-64-230.ngrok-free.app/api/webhooks/google-drive
```

And you should see messages like:
```
✅ Stopped watch for company X, task sheet
✅ Set up watch channel for company X, task sheet: <file-id>
```

### Step 4: Test

After recreating, Google will immediately send a "sync" notification. Check your logs - the URL should be your ngrok URL, NOT localhost.

## Why This Happens

1. **Watch channels are created in Google's system** with a specific webhook URL
2. **That URL is stored by Google** when you call `drive.files.watch()`
3. **Changing your code doesn't update Google's stored URL**
4. **You must stop the old watch and create a new one** with the correct URL

## Quick Test

After recreating, make a small change to your Google Sheet. You should see in logs:

```
[Webhook] ✅ Received change notification from Google Drive
```

And the URL in the logs should be your ngrok URL, not localhost.

## If It Still Doesn't Work

1. Check that the `/api/watch/force-recreate` endpoint actually ran successfully
2. Check the logs for any errors when recreating watches
3. Verify the webhook URL in logs matches your ngrok URL
4. Make sure your ngrok tunnel is still active and the URL hasn't changed
