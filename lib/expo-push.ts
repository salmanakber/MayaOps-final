import { Expo } from 'expo-server-sdk';
import prisma from './prisma';

const expo = new Expo();

export interface ExpoPushMessage {
  to: string;
  sound: 'default' | null;
  title: string;
  body: string;
  data?: any;
  badge?: number;
}

/**
 * Send Expo push notification to a user
 */
export async function sendExpoPushNotification(
  userId: number,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    console.log(`📱 Attempting to send push notification to user ${userId}: ${title}`);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      console.warn(`❌ User ${userId} not found for push notification`);
      return false;
    }

    // Get active device tokens for this user
    const deviceTokens = await prisma.deviceToken.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        expoPushToken: true,
        platform: true,
      },
    });

    console.log(`🔍 Found ${deviceTokens.length} active device token(s) for user ${userId} (${user.email})`);

    if (deviceTokens.length === 0) {
      console.warn(`⚠️ No active device tokens found for user ${userId}. User may need to register their device.`);
      return false;
    }

    // Check user preferences for push notifications (only block if preferences exist and are disabled)
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { pushNotifications: true },
    });

    if (preferences && preferences.pushNotifications === false) {
      console.log(`🔕 Push notifications disabled in preferences for user ${userId}`);
      return false;
    }

    // Prepare messages for all device tokens
    const messages = deviceTokens
      .filter(dt => {
        const isValid = Expo.isExpoPushToken(dt.expoPushToken);
        if (!isValid) {
          console.warn(`⚠️ Invalid Expo push token format for user ${userId}: ${dt.expoPushToken.substring(0, 20)}...`);
        }
        return isValid;
      })
      .map(dt => ({
        to: dt.expoPushToken,
        sound: 'default' as const,
        title,
        body,
        data: data || {},
        badge: 1,
      }));

    if (messages.length === 0) {
      console.warn(`❌ No valid Expo push tokens for user ${userId} after validation`);
      return false;
    }

    console.log(`✅ Sending push notification to ${messages.length} device(s) for user ${userId}`);

    // Send push notifications
    await sendBulkExpoPushNotifications(messages);
    
    console.log(`📱 Push notification sent successfully to ${messages.length} device(s) for user ${userId}: ${title}`);
    
    return true;
  } catch (error: any) {
    console.error(`❌ Error sending Expo push notification to user ${userId}:`, error);
    console.error('Error details:', error.message, error.stack);
    return false;
  }
}

/**
 * Send push notifications to multiple users
 */
export async function sendBulkExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<void> {
  try {
    console.log(`📤 Preparing to send ${messages.length} push notification(s)`);
    
    // Filter out invalid tokens
    const validMessages = messages.filter(message => 
      Expo.isExpoPushToken(message.to)
    );

    if (validMessages.length === 0) {
      console.warn('❌ No valid Expo push tokens found in bulk send');
      return;
    }

    if (validMessages.length < messages.length) {
      console.warn(`⚠️ Filtered out ${messages.length - validMessages.length} invalid token(s)`);
    }

    // Send in chunks (Expo allows up to 100 messages per request)
    const chunks = expo.chunkPushNotifications(validMessages);
    console.log(`📦 Split into ${chunks.length} chunk(s) for sending`);
    
    const tickets = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`📤 Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} messages)`);
        const ticketChunk = await expo.sendPushNotificationsAsync(chunks[i]);
        tickets.push(...ticketChunk);
        console.log(`✅ Chunk ${i + 1} sent successfully, received ${ticketChunk.length} ticket(s)`);
      } catch (error: any) {
        console.error(`❌ Error sending push notification chunk ${i + 1}:`, error);
        console.error('Error details:', error.message);
      }
    }

    // Check ticket receipts for errors
    const receiptIds = tickets
      .filter(ticket => ticket.status === 'ok' && ticket.id)
      .map(ticket => ticket.id!);

    if (receiptIds.length > 0) {
      console.log(`🔍 Checking ${receiptIds.length} receipt(s) for errors...`);
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(receiptIds);
        let errorCount = 0;
        
        for (const receiptId in receipts) {
          const receipt = receipts[receiptId];
          if (receipt.status === 'error') {
            errorCount++;
            console.error(`❌ Push notification error for receipt ${receiptId}:`, receipt.message);
            if (receipt.details) {
              console.error('Error details:', receipt.details);
            }
          }
        }
        
        if (errorCount === 0) {
          console.log(`✅ All ${receiptIds.length} receipt(s) processed successfully`);
        } else {
          console.warn(`⚠️ ${errorCount} receipt(s) had errors out of ${receiptIds.length} total`);
        }
      } catch (receiptError: any) {
        console.error('❌ Error checking receipt status:', receiptError);
      }
    } else {
      console.warn('⚠️ No valid receipt IDs to check');
    }
  } catch (error: any) {
    console.error('❌ Error sending bulk Expo push notifications:', error);
    console.error('Error details:', error.message, error.stack);
  }
}

