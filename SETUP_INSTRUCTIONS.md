# MayaOps MVP Setup Instructions

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Redis (for queue)
- AWS S3 bucket
- Stripe account
- SendGrid or AWS SES account
- Google Cloud project (for Sheets & Maps APIs)

## Step 1: Install Dependencies

```bash
cd web
npm install
npm install pdfkit @types/pdfkit
npm install @sendgrid/mail
npm install @aws-sdk/client-ses
npm install @aws-sdk/client-s3
npm install node-cron
npm install ioredis
```

## Step 2: Environment Variables

Create `.env` file in `/web` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mayaops"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Google APIs
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
GOOGLE_MAPS_API_KEY="AIza..."

# AWS S3
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
AWS_S3_BUCKET="mayaops-production-storage"
AWS_SES_REGION="us-east-1"

# Redis
REDIS_URL="redis://localhost:6379"

# Email
SENDGRID_API_KEY="SG...."
EMAIL_FROM="noreply@mayaops.com"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="your-cron-secret-for-automation"
```

## Step 3: Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed database (optional)
npx prisma db seed
```

## Step 4: Create Super Admin User

```sql
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
  'admin@mayaops.com',
  '$2a$10$...',  -- Use bcrypt to hash password
  'Super',
  'Admin',
  'SUPER_ADMIN',
  true,
  NOW(),
  NOW()
);
```

Or use the API:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mayaops.com","password":"SecurePassword123!","firstName":"Super","lastName":"Admin","role":"SUPER_ADMIN"}'
```

## Step 5: Run Development Server

```bash
npm run dev
```

Server will start at http://localhost:3000

## Step 6: Mobile App Setup

```bash
cd ../mobile
npm install
npm install expo-location expo-notifications expo-image-picker
npm install @react-native-community/datetimepicker
npm install react-native-maps
npm install axios

# Start Expo
npx expo start
```

## Step 7: Configure Cron Jobs

### Option A: Vercel (Production)
Vercel will automatically run cron jobs defined in `vercel.json`

### Option B: Manual Cron (Self-hosted)
```bash
# Add to crontab (runs every 15 minutes)
*/15 * * * * curl -X GET http://localhost:3000/api/cron/sheets-sync -H "Authorization: Bearer your-cron-secret"
```

### Option C: Node Cron (Development)
Create `scripts/cron.ts`:
```typescript
import cron from 'node-cron';
import { handleSheetsSyncCron } from '../lib/cron-sheets-sync';

cron.schedule('*/15 * * * *', async () => {
  console.log('Running sheets sync...');
  await handleSheetsSyncCron();
});
```

## Step 8: Configure Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

## Step 9: Configure AWS S3 Bucket

```bash
# Create bucket
aws s3 mb s3://mayaops-production-storage

# Set bucket policy (public read for photos)
aws s3api put-bucket-policy --bucket mayaops-production-storage --policy file://bucket-policy.json
```

bucket-policy.json:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::mayaops-production-storage/*"
  }]
}
```

## Step 10: Test Email Sending

```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com"}'
```

## Step 11: Verify PDF Generation

```bash
curl -X POST http://localhost:3000/api/pdf/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"taskId":1,"async":false}'
```

## Production Deployment

### Vercel
```bash
cd web
vercel --prod
```

### Docker
```bash
docker build -t mayaops-web .
docker run -p 3000:3000 --env-file .env mayaops-web
```

## Monitoring Setup

### CloudWatch (AWS)
1. Create CloudWatch log group: `/aws/lambda/mayaops-prod`
2. Set up alarms for:
   - API error rate > 5%
   - PDF generation time > 60s
   - Queue depth > 100

### Sentry (Error Tracking)
```bash
npm install @sentry/nextjs
```

Add to `next.config.js`:
```javascript
const { withSentryConfig } = require('@sentry/nextjs');
module.exports = withSentryConfig(config, { silent: true });
```

## Backup Strategy

### Database Backups
```bash
# Daily backup
0 2 * * * pg_dump -U postgres mayaops > /backups/mayaops-$(date +\%Y\%m\%d).sql

# Restore
psql -U postgres mayaops < backup.sql
```

### S3 Backups
Enable versioning and cross-region replication on S3 bucket.

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable database encryption at rest
- [ ] Configure security headers
- [ ] Set up DDoS protection (Cloudflare)
- [ ] Regular security audits
- [ ] Enable 2FA for admin accounts

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## Troubleshooting

### Database connection fails
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Check firewall rules

### PDF generation fails
- Verify pdfkit is installed
- Check AWS S3 permissions
- Increase memory limit if needed

### Email not sending
- Verify SendGrid API key
- Check email sender domain verification
- Review bounce/spam reports

### Cron not running
- Verify CRON_SECRET matches
- Check cron job logs
- Ensure endpoint is accessible

## Support

For issues, contact: support@mayaops.com
Documentation: https://docs.mayaops.com
