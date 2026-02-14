# Fix Watch Channels on Production Server

## The Problem

Even though you've deployed to production, Google is still sending requests to `localhost:3000` because the watch channels in your database were created with that URL.

**Watch channels store the webhook URL in Google's system** - they don't automatically update when you deploy. You need to recreate them.

## Solution: Recreate Watch Channels on Production

### Step 1: Set Environment Variable on Production

Make sure your production server has the correct environment variable:

**For Vercel/Netlify/etc:**
- Go to your deployment platform's environment variables settings
- Set `NEXT_PUBLIC_API_URL` to your production domain:
  ```
  NEXT_PUBLIC_API_URL=https://your-production-domain.com
  ```
  Or if using a custom domain:
  ```
  NEXT_PUBLIC_API_URL=https://api.yourdomain.com
  ```

**For Docker/Server:**
- Update your `.env` file or environment configuration
- Set `NEXT_PUBLIC_API_URL` to your production URL

### Step 2: Restart Your Production Server

Restart your server so it picks up the new environment variable.

### Step 3: Recreate Watch Channels

You have two options:

#### Option A: Use the Force Recreate Endpoint (Recommended)

Call this endpoint on your **production server**:

```bash
POST https://your-production-domain.com/api/watch/force-recreate
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{}
```

This will:
1. Stop all existing watch channels (including the ones with localhost URL)
2. Recreate them with the current `NEXT_PUBLIC_API_URL` value

#### Option B: Use the Setup Endpoint for Each Company

For each company that has a sheet configured:

```bash
POST https://your-production-domain.com/api/watch/setup-company
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "companyId": 1,
  "sheetType": "task"  // or "property"
}
```

### Step 4: Verify

After recreating, check your production logs. You should see:

```
[Watch] Final webhook URL: https://your-production-domain.com/api/webhooks/google-drive
```

**NOT** `localhost:3000`.

### Step 5: Test

After recreating, Google will immediately send a "sync" notification. Check your logs - the URL should be your production domain, not localhost.

## Important Notes

1. **Watch channels are stored in Google's system** - they don't automatically update when you deploy
2. **The database stores the channel info**, but Google uses the URL you provided when creating the watch
3. **You must recreate watch channels** whenever the webhook URL changes
4. **The error I added will prevent** creating new watches with localhost, but existing ones need to be manually recreated

## Quick Check: Verify Environment Variable

You can verify your production server has the correct URL by checking the logs when the server starts. Look for:

```
[Watch] Webhook URL configuration:
[Watch]   NEXT_PUBLIC_API_URL: https://your-production-domain.com
[Watch]   Final webhook URL: https://your-production-domain.com/api/webhooks/google-drive
```

If you see `localhost:3000` there, the environment variable isn't set correctly on production.

## After Fixing

Once you recreate the watch channels with the correct production URL:
- Google will send notifications to your production server
- Sheet changes will trigger syncs automatically
- The webhook endpoint will receive requests at the correct URL
