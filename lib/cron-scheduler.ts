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
  // cron.schedule('*/10 * * * * *', async () => {
  //   await callCron('/api/cron/task-reminders', 'Task Reminders');
  // });

  // ----------------------------
  // Google Drive Watch Renewal — daily at 03:00
  // Renews watch channels before they expire (channels expire after 7 days)
  // Note: This calls POST /api/watch/renew with CRON_SECRET authentication
  // ----------------------------
  // cron.schedule('0 0 3 * * *', async () => {
  //   const url = `${CRON_BASE_URL}/api/watch/renew`;
  //   try {
  //     const res = await fetch(url, {
  //       method: 'POST',
  //       headers: { Authorization: `Bearer ${CRON_SECRET}` },
  //     });
  //     const data = await res.json();
  //     if (res.ok) {
  //       console.log(`[Cron] Watch Renewal:`, data);
  //     } else {
  //       console.error(`[Cron] Watch Renewal HTTP ${res.status}:`, data);
  //     }
  //   } catch (err) {
  //     console.error(`[Cron] Watch Renewal Error:`, err);
  //   }
  // });

  // ----------------------------
  // Sync Property Sheets — every 6 minutes
  // ----------------------------
  // cron.schedule('0 */6 * * * *', async () => {
  //   await callCron('/api/cron/sync-property-sheets', 'Property Sheets Sync');
  // });

  // ----------------------------
  // Expire Device Tokens — daily at midnight
  // ----------------------------
  // cron.schedule('0 0 0 * * *', async () => {
  //   await callCron('/api/cron/expire-device-tokens', 'Expire Device Tokens');
  // });

  // ----------------------------
  // Account Deletion Cleanup — daily at 02:00
  // ----------------------------
  cron.schedule('0 0 2 * * *', async () => {
    await callCron('/api/cron/account-deletion', 'Account Deletion Cleanup');
  });

  console.log('✅ Cron Scheduler Initialized');
}
