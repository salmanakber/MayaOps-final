import * as admin from 'firebase-admin';
import prisma from './prisma';

// Initialize Firebase Admin if not already initialized
let firebaseApp: admin.app.App | null = null;

async function initializeFirebase() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    // Try to get FCM service account from system settings first, then fallback to env
    const prisma = (await import('./prisma')).default;
    let serviceAccountStr = process.env.FCM_SERVICE_ACCOUNT;
    
    try {
      const fcmSetting = await prisma.systemSetting.findUnique({
        where: { key: 'fcm_service_account' },
        select: { value: true, isEncrypted: true },
      });
      
      if (fcmSetting) {
        // Decrypt if needed
        if (fcmSetting.isEncrypted) {
          const crypto = require('crypto');
          const algorithm = 'aes-256-cbc';
          const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
          const decipher = crypto.createDecipheriv(algorithm, key, Buffer.alloc(16, 0));
          let decrypted = decipher.update(fcmSetting.value, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          serviceAccountStr = decrypted;
        } else {
          serviceAccountStr = fcmSetting.value;
        }
      }
    } catch (settingError) {
      console.warn('Could not load FCM service account from settings, using env variable');
    }
    
    if (!serviceAccountStr || serviceAccountStr === '{}') {
      throw new Error(
        'FCM_SERVICE_ACCOUNT not configured. ' +
        'Please set it in admin settings or as an environment variable.'
      );
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountStr);
    } catch (error) {
      throw new Error('FCM_SERVICE_ACCOUNT contains invalid JSON.');
    }

    if (!serviceAccount.project_id) {
      throw new Error('FCM_SERVICE_ACCOUNT is missing required fields.');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });

    console.log('✅ Firebase Admin initialized successfully');
    return firebaseApp;
  } catch (error: any) {
    console.error('❌ Error initializing Firebase Admin:', error);
    throw error;
  }
}

export interface FCMPushMessage {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  android?: {
    priority: 'high' | 'normal';
    notification?: {
      sound?: string;
      channelId?: string;
    };
  };
  apns?: {
    payload?: {
      aps?: {
        sound?: string;
        badge?: number;
      };
    };
  };
}

/**
 * Send FCM push notification to a user
 */
export async function sendFCMPushNotification(
  userId: number,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    console.log(`🔥 Attempting to send FCM push notification to user ${userId}: ${title}`);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      console.warn(`❌ User ${userId} not found for FCM push notification`);
      return false;
    }

    // Get active device tokens for this user (FCM tokens)
    const deviceTokens = await prisma.deviceToken.findMany({
      where: {
        userId,
        isActive: true,
        fcmToken: { not: null },
      },
      select: {
        fcmToken: true,
        platform: true,
      },
    });

    console.log(`🔍 Found ${deviceTokens.length} active FCM device token(s) for user ${userId} (${user.email})`);

    if (deviceTokens.length === 0) {
      console.warn(`⚠️ No active FCM device tokens found for user ${userId}. User may need to register their device.`);
      return false;
    }

    // Check user preferences for push notifications
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { pushNotifications: true },
    });

    if (preferences && preferences.pushNotifications === false) {
      console.log(`🔕 Push notifications disabled in preferences for user ${userId}`);
      return false;
    }

    // Initialize Firebase
    const app = await initializeFirebase();
    const messaging = admin.messaging(app);

    // Prepare messages for all device tokens
    const messages: admin.messaging.Message[] = deviceTokens
      .filter(dt => dt.fcmToken && dt.fcmToken.trim().length > 0)
      .map(dt => {
        const message: admin.messaging.Message = {
          token: dt.fcmToken!,
          notification: {
            title,
            body,
          },
          data: data ? Object.entries(data).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as Record<string, string>) : {},
        };

        // Platform-specific configuration
        if (dt.platform === 'android') {
          message.android = {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'default',
            },
          };
        } else if (dt.platform === 'ios') {
          message.apns = {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          };
        }

        return message;
      });

    if (messages.length === 0) {
      console.warn(`❌ No valid FCM tokens for user ${userId} after validation`);
      return false;
    }

    console.log(`✅ Sending FCM push notification to ${messages.length} device(s) for user ${userId}`);

    // Send push notifications
    const responses = await messaging.sendEach(messages);
    
    let successCount = 0;
    let failureCount = 0;

    responses.responses.forEach((response, index) => {
      if (response.success) {
        successCount++;
        console.log(`✅ FCM notification sent successfully to device ${index + 1}`);
      } else {
        failureCount++;
        console.error(`❌ FCM notification failed for device ${index + 1}:`, response.error);
        
        // If token is invalid, deactivate it
        if (response.error?.code === 'messaging/invalid-registration-token' || 
            response.error?.code === 'messaging/registration-token-not-registered') {
          const token = deviceTokens[index]?.fcmToken;
          if (token) {
            prisma.deviceToken.updateMany({
              where: { fcmToken: token },
              data: { isActive: false },
            }).catch(err => console.error('Error deactivating invalid token:', err));
          }
        }
      }
    });

    console.log(`📱 FCM push notification sent: ${successCount} success, ${failureCount} failure(s) for user ${userId}: ${title}`);
    
    return successCount > 0;
  } catch (error: any) {
    console.error(`❌ Error sending FCM push notification to user ${userId}:`, error);
    console.error('Error details:', error.message, error.stack);
    return false;
  }
}

/**
 * Send FCM push notifications to multiple users
 */
export async function sendBulkFCMPushNotifications(
  messages: FCMPushMessage[]
): Promise<void> {
  try {
    console.log(`📤 Preparing to send ${messages.length} FCM push notification(s)`);
    
    if (messages.length === 0) {
      console.warn('❌ No FCM messages to send');
      return;
    }

    // Initialize Firebase
    const app = await initializeFirebase();
    const messaging = admin.messaging(app);

    // Convert to Firebase Admin format
    const firebaseMessages: admin.messaging.Message[] = messages.map(msg => {
        const message: admin.messaging.Message = {
          token: msg.token,
          notification: msg.notification,
          data: msg.data || {},
          android: msg.android,
        };
      
        // Only include apns if msg.apns exists or if we want to always send iOS payload
        message.apns = {
          payload: {
            aps: {
              sound: msg.apns?.payload?.aps?.sound ?? 'default',
              badge: msg.apns?.payload?.aps?.badge ?? 0,
            } as admin.messaging.Aps, // ✅ cast to Aps type
          },
        };
      
        return message;
      });
      

    // Send in batches (FCM allows up to 500 messages per batch)
    const batchSize = 500;
    const batches = [];
    
    for (let i = 0; i < firebaseMessages.length; i += batchSize) {
      batches.push(firebaseMessages.slice(i, i + batchSize));
    }

    console.log(`📦 Split into ${batches.length} batch(es) for sending`);

    for (let i = 0; i < batches.length; i++) {
      try {
        console.log(`📤 Sending batch ${i + 1}/${batches.length} (${batches[i].length} messages)`);
        const responses = await messaging.sendEach(batches[i]);
        
        let successCount = 0;
        let failureCount = 0;

        responses.responses.forEach((response, index) => {
          if (response.success) {
            successCount++;
          } else {
            failureCount++;
            console.error(`❌ FCM notification failed in batch ${i + 1}, message ${index + 1}:`, response.error);
          }
        });

        console.log(`✅ Batch ${i + 1} sent: ${successCount} success, ${failureCount} failure(s)`);
      } catch (error: any) {
        console.error(`❌ Error sending FCM batch ${i + 1}:`, error);
        console.error('Error details:', error.message);
      }
    }
  } catch (error: any) {
    console.error('❌ Error sending bulk FCM push notifications:', error);
    console.error('Error details:', error.message, error.stack);
  }
}

