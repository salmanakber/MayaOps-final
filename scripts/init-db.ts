// import { initializeDatabase } from '../lib/db';
// import { hashPassword } from '../lib/auth';
// import pool from '../lib/db';

// async function seedDatabase() {
//   try {
//     console.log('Initializing database tables...');
//     await initializeDatabase();

//     // Create a default test user
//     const testEmail = 'cleaner@test.com';
//     const testPassword = 'Test1234';

//     // Check if test user already exists
//     const existingUser = await pool.query(
//       'SELECT id FROM users WHERE email = $1',
//       [testEmail]
//     );

//     if (existingUser.rows.length === 0) {
//       const passwordHash = await hashPassword(testPassword);
//       await pool.query(
//         `INSERT INTO users (email, password_hash, first_name, last_name, role)
//          VALUES ($1, $2, $3, $4, $5)`,
//         [testEmail, passwordHash, 'Test', 'Cleaner', 'cleaner']
//       );
//       console.log('✅ Test user created:');
//       console.log('   Email:', testEmail);
//       console.log('   Password:', testPassword);
//     } else {
//       console.log('ℹ️  Test user already exists');
//     }

//     console.log('✅ Database initialization complete!');
//     process.exit(0);
//   } catch (error) {
//     console.error('❌ Database initialization failed:', error);
//     process.exit(1);
//   }
// }

// seedDatabase();
