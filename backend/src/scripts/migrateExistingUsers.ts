/**
 * Migration script to create default accounts for existing users
 * Run this once to migrate existing users to the new account system
 * 
 * Usage: npx ts-node src/scripts/migrateExistingUsers.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Account } from '../models/Account';
import { UserAccount } from '../models/UserAccount';
import { connectDatabase } from '../utils/database';

dotenv.config();

async function migrateExistingUsers() {
  try {
    console.log('Connecting to database...');
    await connectDatabase();
    console.log('Connected to database');

    // Find all users
    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Check if user already has any accounts
        const existingMemberships = await UserAccount.find({ userId: user._id });
        
        if (existingMemberships.length > 0) {
          console.log(`User ${user.email} already has accounts, skipping...`);
          skipped++;
          continue;
        }

        // Create default account
        const account = new Account({
          name: `${user.name}'s Account`,
          ownerId: user._id,
        });
        await account.save();

        // Create membership with owner role
        const membership = new UserAccount({
          userId: user._id,
          accountId: account._id,
          role: 'owner',
        });
        await membership.save();

        console.log(`✓ Created account for ${user.email}`);
        migrated++;
      } catch (error: any) {
        console.error(`✗ Error migrating user ${user.email}:`, error.message);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users: ${users.length}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped (already have accounts): ${skipped}`);
    console.log(`Errors: ${errors}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateExistingUsers();

