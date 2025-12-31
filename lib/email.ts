// Email service using SMTP, AWS SES, or SendGrid
// SMTP support via nodemailer
import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

async function getEmailSettings() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    const settings = await (prisma as any).systemSetting.findMany({
      where: {
        category: 'email',
        key: {
          in: [
            'email_provider', 
            'smtp_host', 
            'smtp_port', 
            'smtp_secure', 
            'smtp_username', 
            'smtp_password', 
            'ses_access_key', 
            'ses_secret_key', 
            'ses_region', 
            'sendgrid_api_key',
            'from_email'
          ],
        },
      },
    }).catch(() => []);

    const settingsMap: Record<string, string> = {};
    settings.forEach(setting => {
      // Decrypt if needed
      let value = setting.value;
      if (setting.isEncrypted) {
        // Decrypt logic (same as in settings route)
        const crypto = require('crypto');
        const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'default-key-change-in-production';
        const ALGORITHM = 'aes-256-cbc';
        try {
          const parts = value.split(':');
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')), iv);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          value = decrypted;
        } catch (e) {
          console.error('Failed to decrypt email setting:', e);
        }
      }
      settingsMap[setting.key] = value;
    });

    return {
      provider: settingsMap['email_provider'] || process.env.EMAIL_PROVIDER || 'smtp',
      // SMTP settings
      smtpHost: settingsMap['smtp_host'] || process.env.SMTP_HOST,
      smtpPort: settingsMap['smtp_port'] ? parseInt(settingsMap['smtp_port']) : parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: settingsMap['smtp_secure'] === 'true' || process.env.SMTP_SECURE === 'true',
      smtpUsername: settingsMap['smtp_username'] || process.env.SMTP_USERNAME,
      smtpPassword: settingsMap['smtp_password'] || process.env.SMTP_PASSWORD,
      // AWS SES settings
      sesAccessKey: settingsMap['ses_access_key'] || process.env.AWS_SES_ACCESS_KEY,
      sesSecretKey: settingsMap['ses_secret_key'] || process.env.AWS_SES_SECRET_KEY,
      sesRegion: settingsMap['ses_region'] || process.env.AWS_SES_REGION,
      // SendGrid settings (for backward compatibility)
      sendgridApiKey: settingsMap['sendgrid_api_key'] || process.env.SENDGRID_API_KEY,
      // From email
      fromEmail: settingsMap['from_email'] || process.env.EMAIL_FROM || 'noreply@mayaops.com',
    };
  } catch (error) {
    console.error('Error fetching email settings:', error);
    // Fallback to environment variables
    return {
      provider: process.env.EMAIL_PROVIDER || 'smtp',
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUsername: process.env.SMTP_USERNAME,
      smtpPassword: process.env.SMTP_PASSWORD,
      sesAccessKey: process.env.AWS_SES_ACCESS_KEY,
      sesSecretKey: process.env.AWS_SES_SECRET_KEY,
      sesRegion: process.env.AWS_SES_REGION,
      sendgridApiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.EMAIL_FROM || 'noreply@mayaops.com',
    };
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const emailSettings = await getEmailSettings();
    const fromEmail = options.from || emailSettings.fromEmail;

    // Option 1: SMTP (Custom SMTP Server)
    if (emailSettings.provider === 'smtp' && emailSettings.smtpHost && emailSettings.smtpUsername && emailSettings.smtpPassword) {
      
      console.log('🔑 SMTP Settings:', {
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort,
        secure: emailSettings.smtpSecure,
        username: emailSettings.smtpUsername,
        password: emailSettings.smtpPassword,
        fromEmail: fromEmail,
        provider: emailSettings.provider,
      });

      const transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort || 587,
        secure: emailSettings.smtpSecure, // true for 465, false for other ports
        auth: {
          user: emailSettings.smtpUsername,
          pass: emailSettings.smtpPassword,
        },
        // Additional options for better compatibility
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log(`✅ Email sent via SMTP to ${options.to}`);
      return true;
    }

    // Option 2: AWS SES
    if (emailSettings.provider === 'ses' && emailSettings.sesRegion && emailSettings.sesAccessKey && emailSettings.sesSecretKey) {
      const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
      
      const client = new SESClient({ 
        region: emailSettings.sesRegion,
        credentials: {
          accessKeyId: emailSettings.sesAccessKey,
          secretAccessKey: emailSettings.sesSecretKey,
        },
      });
      
      const command = new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [options.to] },
        Message: {
          Subject: { Data: options.subject },
          Body: { Html: { Data: options.html } },
        },
      });
      
      await client.send(command);
      console.log(`✅ Email sent via AWS SES to ${options.to}`);
      return true;
    }

    // Option 3: SendGrid (for backward compatibility)
    if (emailSettings.provider === 'sendgrid' && emailSettings.sendgridApiKey) {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(emailSettings.sendgridApiKey);
      
      await sgMail.send({
        to: options.to,
        from: fromEmail,
        subject: options.subject,
        html: options.html,
      });
      
      console.log(`✅ Email sent via SendGrid to ${options.to}`);
      return true;
    }

    // Fallback: Log to console (development)
    console.warn('[EMAIL] No email provider configured. Would send:', {
      to: options.to,
      subject: options.subject,
      html: options.html.substring(0, 100) + '...',
    });
    
    return true;
  } catch (error: any) {
    console.error('Email send error:', error);
    console.error('Error details:', error.message, error.stack);
    return false;
  }
}

export async function sendTaskAssignmentEmail(
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  propertyAddress: string,
  scheduledDate: Date
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Task Assignment</h1>
          </div>
          <div class="content">
            <p>Hi ${recipientName},</p>
            <p>You have been assigned a new cleaning task:</p>
            <ul>
              <li><strong>Task:</strong> ${taskTitle}</li>
              <li><strong>Property:</strong> ${propertyAddress}</li>
              <li><strong>Scheduled:</strong> ${scheduledDate.toLocaleString()}</li>
            </ul>
            <p>Please log in to the MayaOps app to view full details.</p>
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.mayaops.com'}" class="button">View Task</a>
            </p>
          </div>
          <div class="footer">
            <p>© 2025 MayaOps. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `New Task Assignment: ${taskTitle}`,
    html,
  });
}

export async function sendQAResultEmail(
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  overallScore: number,
  comments?: string
): Promise<boolean> {
  const passed = overallScore >= 7;
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${passed ? '#10B981' : '#EF4444'};">
            QA Review ${passed ? 'Passed' : 'Needs Improvement'}
          </h2>
          <p>Hi ${recipientName},</p>
          <p>Your task "${taskTitle}" has been reviewed.</p>
          <p><strong>Overall Score:</strong> ${overallScore}/10</p>
          ${comments ? `<p><strong>Feedback:</strong> ${comments}</p>` : ''}
          <p>Keep up the good work!</p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `QA Review: ${taskTitle}`,
    html,
  });
}
