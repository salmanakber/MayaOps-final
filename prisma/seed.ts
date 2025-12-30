import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const defaultPassword = 'Test1234!';

interface UserSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyId?: number | null;
}

async function main() {
  console.log('🌱 Starting database seed...');

  // Hash password once for all users
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // Create test company
  const testCompany = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'MayaOps Test Company',
      subscriptionStatus: 'active',
      basePrice: 55.00,
      propertyCount: 0
    }
  });

  console.log('✅ Test company created/updated:', testCompany.name);

  // Define all test users
  const usersToCreate: UserSeed[] = [
    // Global roles (no company)
    {
      email: 'superadmin@mayaops.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    },
    {
      email: 'owner@mayaops.com',
      firstName: 'MayaOps',
      lastName: 'Owner',
      role: UserRole.OWNER,
      companyId: null,
    },
    {
      email: 'developer@mayaops.com',
      firstName: 'Tech',
      lastName: 'Developer',
      role: UserRole.DEVELOPER,
      companyId: null,
    },
    // Company roles
    {
      email: 'admin@testcompany.com',
      firstName: 'Company',
      lastName: 'Admin',
      role: UserRole.COMPANY_ADMIN,
      companyId: testCompany.id,
    },
    {
      email: 'manager@testcompany.com',
      firstName: 'Operations',
      lastName: 'Manager',
      role: UserRole.MANAGER,
      companyId: testCompany.id,
    },
    {
      email: 'cleaner1@testcompany.com',
      firstName: 'John',
      lastName: 'Cleaner',
      role: UserRole.CLEANER,
      companyId: testCompany.id,
    },
    {
      email: 'cleaner2@testcompany.com',
      firstName: 'Jane',
      lastName: 'Cleaner',
      role: UserRole.CLEANER,
      companyId: testCompany.id,
    },
    {
      email: 'cleaner3@testcompany.com',
      firstName: 'Mike',
      lastName: 'Cleaner',
      role: UserRole.CLEANER,
      companyId: testCompany.id,
    },
  ];

  // Create or update users
  const createdUsers: { email: string; role: string }[] = [];
  const existingUsers: string[] = [];

  for (const userData of usersToCreate) {
    const existing = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existing) {
      // Update existing user
      await prisma.user.update({
        where: { email: userData.email },
        data: {
          passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          companyId: userData.companyId,
          isActive: true,
        },
      });
      existingUsers.push(userData.email);
      console.log(`🔄 Updated user: ${userData.email} (${userData.role})`);
    } else {
      // Create new user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          companyId: userData.companyId,
          isActive: true,
        },
      });
      createdUsers.push({ email: userData.email, role: userData.role });
      console.log(`✅ Created user: ${userData.email} (${userData.role})`);
    }
  }

  // Create some test properties
  const properties = [
    {
      address: '123 Main Street',
      postcode: 'SW1A 1AA',
      propertyType: 'apartment',
      companyId: testCompany.id,
    },
    {
      address: '456 Oak Avenue',
      postcode: 'NW1 6XE',
      propertyType: 'block',
      companyId: testCompany.id,
    },
    {
      address: '789 Elm Road',
      postcode: 'E1 6AN',
      propertyType: 'hmo',
      companyId: testCompany.id,
    },
  ];

  for (const prop of properties) {
    const existing = await prisma.property.findFirst({
      where: {
        address: prop.address,
        companyId: prop.companyId,
      },
    });

    if (!existing) {
      await prisma.property.create({
        data: prop,
      });
      console.log(`✅ Created property: ${prop.address}`);
    }
  }

  // Update company property count
  const propertyCount = await prisma.property.count({
    where: { companyId: testCompany.id },
  });
  await prisma.company.update({
    where: { id: testCompany.id },
    data: { propertyCount },
  });

  // Print summary
  console.log('\n📊 Seed Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n🔐 Default Password for ALL users: ${defaultPassword}`);
  console.log('\n👥 Test Users Created/Updated:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  usersToCreate.forEach((user) => {
    const status = existingUsers.includes(user.email) ? '🔄 Updated' : '✅ Created';
    const companyInfo = user.companyId ? `(Company: ${testCompany.name})` : '(Global - No Company)';
    console.log(`${status} ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   ${companyInfo}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ Database seeding complete!');
  console.log(`\n📝 You can now login with any of the above emails using password: ${defaultPassword}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
