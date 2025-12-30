// SMS service using Twilio
// Install: npm install twilio

interface SMSOptions {
  to: string;
  message: string;
}

export async function sendSMS(options: SMSOptions): Promise<boolean> {
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      await client.messages.create({
        body: options.message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: options.to,
      });
      
      return true;
    }

    // Fallback: Log to console (development)
    console.log('[SMS] Would send:', {
      to: options.to,
      message: options.message,
    });
    
    return true;
  } catch (error) {
    console.error('SMS send error:', error);
    return false;
  }
}

export async function sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
  const message = `Your MayaOps verification code is: ${otp}. Valid for 10 minutes.`;
  return sendSMS({ to: phoneNumber, message });
}
