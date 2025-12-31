import cron from 'node-cron';
import fetch from 'node-fetch';

const CRON_SECRET = process.env.CRON_SECRET || 'development-secret';

// Prevent multiple initializations
let initialized = false;

export function initCronScheduler() {
  if (initialized) return;
  initialized = true;

  // ----------------------------
  // Task Reminders — every 10 sec
  // ----------------------------
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:3000/api/cron/task-reminders`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      console.log('[Cron] Task Reminders:', data || data);
    } catch (err) {
      console.error('[Cron] Task Reminders Error:', err);
    }
  });

  // ----------------------------
  // Sheets Sync — every 1 minute
  // ----------------------------
  cron.schedule('0 * * * * *', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:3000/api/cron/sheets-sync`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      console.log('[Cron] Sheets Sync:', data);
    } catch (err) {
      console.error('[Cron] Sheets Sync Error:', err);
    }
  });

  // ----------------------------
  // Sync Property Sheets — every 6 minutes
  // ----------------------------
  cron.schedule('0 */6 * * * *', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:3000/api/cron/sync-property-sheets`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      console.log('[Cron] Property Sheets Sync:', data);
    } catch (err) {
      console.error('[Cron] Property Sheets Sync Error:', err);
    }
  });

  // ----------------------------
  // Expire Device Tokens — daily at midnight
  // ----------------------------
  cron.schedule('0 0 0 * * *', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:3000/api/cron/expire-device-tokens`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const data = await res.json();
      console.log('[Cron] Expire Device Tokens:', data);
    } catch (err) {
      console.error('[Cron] Expire Device Tokens Error:', err);
    }
  });

  console.log('✅ Cron Scheduler Initialized');
}
