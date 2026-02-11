import cron from 'node-cron';
import fetch from 'node-fetch';

const CRON_SECRET = process.env.CRON_SECRET || 'development-secret';
const CRON_BASE_URL =
  process.env.CRON_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:3000';

// Prevent multiple initializations
let initialized = false;

export function initCronScheduler() {
  if (initialized) return;
  initialized = true;

  async function callCron(path: string, label: string) {
    const url = `${CRON_BASE_URL}${path}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });

      const contentType = res.headers.get('content-type') || '';
      const bodyText = await res.text();

      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(bodyText);
        } catch {
          data = { success: false, message: 'Invalid JSON response', bodyPreview: bodyText.slice(0, 300) };
        }
      } else {
        // If we got HTML (e.g. Next error page / 404 / wrong port), show a preview
        data = { success: false, message: 'Non-JSON response', contentType, bodyPreview: bodyText.slice(0, 300) };
      }

      if (!res.ok) {
        console.error(`[Cron] ${label} HTTP ${res.status}:`, data);
      } else {
        console.log(`[Cron] ${label}:`, data);
      }
    } catch (err) {
      console.error(`[Cron] ${label} Error:`, err);
    }
  }

  // ----------------------------
  // Task Reminders — every 10 sec
  // ----------------------------
  cron.schedule('*/10 * * * * *', async () => {
    await callCron('/api/cron/task-reminders', 'Task Reminders');
  });

  // ----------------------------
  // Sheets Sync — every 1 minute
  // ----------------------------
  cron.schedule('0 * * * * *', async () => {
    await callCron('/api/cron/sheets-sync', 'Sheets Sync');
  });

  // ----------------------------
  // Sync Property Sheets — every 6 minutes
  // ----------------------------
  cron.schedule('0 */6 * * * *', async () => {
    await callCron('/api/cron/sync-property-sheets', 'Property Sheets Sync');
  });

  // ----------------------------
  // Expire Device Tokens — daily at midnight
  // ----------------------------
  cron.schedule('0 0 0 * * *', async () => {
    await callCron('/api/cron/expire-device-tokens', 'Expire Device Tokens');
  });

  console.log('✅ Cron Scheduler Initialized');
}
