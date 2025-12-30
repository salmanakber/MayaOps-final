# MayaOps Web Backend

Cloud-based cleaning and property management platform - Backend & Admin Portal

## Tech Stack

- **Framework**: Next.js 14
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT
- **Storage**: AWS S3
- **Cache/Queue**: Redis
- **Payments**: Stripe
- **APIs**: Google Sheets, Google Maps

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `GOOGLE_SHEETS_CREDENTIALS` - Google Service Account JSON
- `GOOGLE_MAPS_API_KEY` - Google Maps API key
- `AWS_ACCESS_KEY_ID` - AWS S3 access key
- `AWS_SECRET_ACCESS_KEY` - AWS S3 secret key
- `AWS_S3_BUCKET` - S3 bucket name
- `REDIS_URL` - Redis connection string

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database
npm run prisma:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

## Project Structure

```
/app
  /api              # API routes
    /auth           # Authentication endpoints
    /tasks          # Task management
    /properties     # Property management
    /photos         # Photo upload/management
    /pdf            # PDF generation
    /rota           # Rota/scheduling
    /admin          # Admin endpoints
    /stripe         # Stripe webhooks
  /admin            # Admin UI pages
/lib                # Utility libraries
  - auth.ts         # Authentication utilities
  - rbac.ts         # Role-based access control
  - stripe.ts       # Stripe integration
  - s3.ts           # AWS S3 utilities
  - pdf-generator.ts # PDF generation
  - notifications.ts # Notification system
  - geolocation.ts  # Geolocation utilities
  - audit.ts        # Audit logging
  - queue.ts        # Redis queue
  - sheets.ts       # Google Sheets integration
/prisma
  - schema.prisma   # Database schema
  /migrations       # Database migrations
```

## Key Features

### 1. Multi-Company Architecture
- Data isolation per company
- Role-based access control (RBAC)
- Roles: Owner, Developer, Company Admin, Manager, Cleaner

### 2. Billing System
- Base: £55/month per company
- Additional: £1 per property
- Stripe integration with webhooks
- Automatic proration

### 3. Task Management
- Status workflow: Draft → Planned → Assigned → In Progress → Submitted → QA Review → Approved/Rejected → Archived
- Recurring jobs (daily, weekly, bi-weekly, monthly)
- Photo evidence (minimum 20 before/after)
- PDF report generation

### 4. Google Sheets Integration
- Auto-sync every 15 minutes
- Property data import
- Validation error reporting

### 5. Geolocation
- GPS validation (150m geofence)
- Location logging
- Distance calculation

### 6. Notifications
- Task assignments
- Reminders (24h, 1h before)
- Missing photos alerts
- QA results
- High severity issues

### 7. Audit Logging
- All CRUD operations tracked
- Exportable audit trail
- GDPR compliant

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/[id]` - Get task
- `PATCH /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task
- `PATCH /api/tasks/[id]/status` - Update status
- `POST /api/tasks/recurring` - Generate recurring instances

### Photos
- `GET /api/photos` - List photos
- `POST /api/photos/upload` - Upload photo
- `DELETE /api/photos/[id]` - Delete photo

### PDF
- `POST /api/pdf/generate` - Generate PDF report
- `GET /api/pdf/download/[taskId]` - Download PDF

### Rota
- `GET /api/rota` - Get rota
- `POST /api/rota/assign` - Assign cleaner to task
- `GET /api/rota/conflicts` - Check conflicts
- `POST /api/rota/week-clone` - Clone week

### Admin
- `GET /api/admin/companies` - List companies
- `POST /api/admin/companies` - Create company
- `GET /api/admin/billing` - Billing records
- `GET /api/admin/audit-log` - Audit logs
- `GET /api/admin/configurations` - Get config
- `PATCH /api/admin/configurations` - Update config

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
npm run prisma:seed      # Seed database
```

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Company data isolation
- TLS encryption
- GDPR compliance

## Performance

- API response: <300ms (p95)
- PDF generation: <60s
- Concurrent users: 1,000+
- Uptime: 99.9% SLA

## Testing

Test user credentials (after seeding):
- Email: `cleaner@test.com`
- Password: `Test1234`

## Support

For issues or questions, contact the MayaOps development team.
