# Google Drive Push Notifications (Watch API) Setup

This system uses Google Drive Push Notifications (Watch API) to receive real-time notifications when Google Sheets are modified, replacing the previous polling-based cron job.

## How It Works

1. **Watch Channel Setup**: When a company configures a Google Sheet, a watch channel is automatically created that subscribes to changes on that sheet.

2. **Push Notifications**: When the sheet is modified, Google sends a POST request to our webhook endpoint (`/api/webhooks/google-drive`) with change details.

3. **Automatic Sync**: The webhook endpoint identifies which company's sheet was changed and triggers the appropriate sync process.

4. **Channel Renewal**: Watch channels expire after 7 days. A daily cron job automatically renews channels before expiration.

## Configuration

### Environment Variables

Ensure these are set in your `.env` file:

```env
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account",...}'
NEXT_PUBLIC_API_URL="https://your-domain.com"  # Must be publicly accessible
CRON_SECRET="your-secret-key"
```

### Webhook URL

The webhook URL is automatically constructed as:
```
{NEXT_PUBLIC_API_URL}/api/webhooks/google-drive
```

**Important**: This URL must be publicly accessible for Google to send notifications. If you're developing locally, use a tool like ngrok to expose your local server.

### Google Cloud Console Setup

1. Enable the **Google Drive API** in your Google Cloud Console project
2. Ensure your service account has the following scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`

## Automatic Setup

Watch channels are automatically set up:
- When a company configures a task sheet via `/api/companies/[id]/task-sheet/sync`
- When a company configures a property sheet (via the existing sync process)
- On server startup (via `/api/cron-init`)

## Manual Operations

### Set Up Watches for All Companies

```bash
POST /api/watch/setup
Authorization: Bearer <admin-token>
```

### Renew Expiring Watches

```bash
POST /api/watch/renew
Authorization: Bearer <admin-token>
```

Or via cron (automated):
```bash
POST /api/watch/renew
Authorization: Bearer <CRON_SECRET>
```

## Cron Jobs

The following cron jobs are configured:

- **Watch Renewal**: Daily at 03:00 - Renews watch channels before expiration
- **Property Sheets Sync**: Every 6 minutes - Legacy sync (still runs for backward compatibility)

**Note**: The previous "Sheets Sync" cron job (every 1 minute) has been removed and replaced with push notifications.

## Database Storage

Watch channel information is stored in `SystemSettings` table with keys:
- `company_{id}_property_sheet_watch_channel` - For property sheets
- `company_{id}_task_sheet_watch_channel` - For task sheets

Each setting contains JSON with:
```json
{
  "id": "channel-uuid",
  "resourceId": "google-resource-id",
  "expiration": 1234567890000
}
```

## Troubleshooting

### Webhook Not Receiving Notifications

1. Verify the webhook URL is publicly accessible
2. Check Google Cloud Console logs
3. Verify the service account has proper permissions
4. Check server logs for webhook requests

### Watch Channels Expiring

- Watch channels expire after 7 days
- The renewal cron job runs daily at 03:00
- You can manually renew via `/api/watch/renew`

### Setting Up Watches Manually

If automatic setup fails, you can manually set up watches:

```bash
POST /api/watch/setup
Authorization: Bearer <admin-token>
```

## Migration from Polling

The old polling-based cron job (`/api/cron/sheets-sync`) has been removed from the scheduler. The endpoint still exists for backward compatibility but is no longer called automatically.

To fully migrate:
1. Set up watches for all companies (happens automatically on startup)
2. Monitor webhook logs to ensure notifications are being received
3. Once confirmed, you can remove the old cron endpoint if desired
