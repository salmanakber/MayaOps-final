# Debugging Google Drive Webhook Issues

If your webhook isn't receiving notifications, follow these steps:

## Step 1: Verify Webhook Endpoint is Accessible

Test if your webhook endpoint is reachable:

```bash
# Test the webhook endpoint directly
curl -X GET https://your-ngrok-url.ngrok.io/api/webhooks/google-drive

# Should return: {"success":true,"message":"Google Drive webhook endpoint is active",...}
```

## Step 2: Check Watch Channel Status

Check which companies have watch channels set up:

```bash
GET /api/watch/status
Authorization: Bearer <admin-token>
```

This will show:
- Which companies have watches configured
- Watch channel IDs and resource IDs
- Expiration dates
- Whether watches are expired

## Step 3: Verify Watch Channel Was Created

When you set up a watch, check the logs for:
```
[Watch] Setting up watch channel for file <file-id>
[Watch] Channel ID: <channel-id>
[Watch] Webhook URL: <your-ngrok-url>/api/webhooks/google-drive
[Watch] Expiration: <date>
[Watch] Watch channel response: { resourceId: "...", ... }
```

## Step 4: Check Environment Variables

Ensure your `.env` file has:
```env
NEXT_PUBLIC_API_URL="https://your-ngrok-url.ngrok.io"
# OR
CRON_BASE_URL="https://your-ngrok-url.ngrok.io"
```

**Important**: The URL must:
- Use HTTPS (ngrok provides this)
- Be publicly accessible
- Match exactly what you configured in Google

## Step 5: Manually Set Up Watch for Your Company

If the watch wasn't set up automatically:

```bash
POST /api/watch/setup-company
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "companyId": <your-company-id>,
  "sheetType": "task"  // or "property"
}
```

## Step 6: Test Webhook Manually

Test if the webhook endpoint works:

```bash
POST /api/watch/test-webhook
Content-Type: application/json

{
  "test": "data"
}
```

Check your server logs - you should see the request logged.

## Step 7: Verify Google Can Reach Your Webhook

1. Check ngrok dashboard - you should see incoming requests
2. Check server logs when Google sends notifications
3. Google sends a "sync" notification immediately after watch setup

## Step 8: Common Issues

### Issue: Watch channel not created
**Solution**: Manually set up watch using `/api/watch/setup-company`

### Issue: Wrong webhook URL
**Solution**: 
1. Check `NEXT_PUBLIC_API_URL` or `CRON_BASE_URL` in `.env`
2. Restart server
3. Recreate watch channel (old one has wrong URL)

### Issue: Webhook not receiving requests
**Solution**:
1. Verify ngrok is running and URL is correct
2. Check ngrok dashboard for incoming requests
3. Verify webhook endpoint is accessible via GET request
4. Check if firewall/security is blocking Google's IPs

### Issue: Watch channel expired
**Solution**: 
- Watch channels expire after 7 days
- Run `/api/watch/renew` to renew them
- Or manually recreate using `/api/watch/setup-company`

## Step 9: Check Google Cloud Console

1. Go to Google Cloud Console
2. Navigate to APIs & Services > Enabled APIs
3. Ensure **Google Drive API** is enabled (not just Sheets API)
4. Check API quotas and limits

## Step 10: Verify Service Account Permissions

Your service account needs:
- Access to the Google Sheet
- Drive API enabled
- Proper scopes: `drive.readonly` and `spreadsheets.readonly`

## Debugging Commands

```bash
# Check watch status
curl -X GET https://your-api/api/watch/status \
  -H "Authorization: Bearer <token>"

# Set up watch for specific company
curl -X POST https://your-api/api/watch/setup-company \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"companyId": 1, "sheetType": "task"}'

# Test webhook endpoint
curl -X POST https://your-api/api/watch/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

## Expected Behavior

1. **When watch is set up**: Google immediately sends a "sync" notification
2. **When sheet changes**: Google sends a "change" notification with resourceId
3. **Webhook logs**: You should see detailed logs in server console

## Next Steps

If still not working:
1. Check all server logs for errors
2. Verify ngrok URL hasn't changed (restart server if it did)
3. Recreate watch channel with correct URL
4. Test with a simple webhook test endpoint first
