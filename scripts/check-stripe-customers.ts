/**
 * Test Script: Check User-Customer Linking
 * 
 * This script checks which local users have stripeCustomerId set
 * and compares with Stripe customers to identify mismatches.
 * 
 * Run with: npx ts-node scripts/check-stripe-customers.ts
 */

import { config } from 'dotenv';
config({ path: '.env.development' });

import prisma from '../src/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-06-20' as any
});

async function checkStripeCustomers() {
    console.log('🔍 Checking User-Customer Linking...\n');

    try {
        // Get all local users
        const users = await prisma.user.findMany({
            select: { id: true, email: true, stripeCustomerId: true }
        });

        console.log(`📊 Local Users: ${users.length}`);
        console.log('   Users with Stripe Customer ID:');
        const usersWithStripe = users.filter(u => u.stripeCustomerId);
        const usersWithoutStripe = users.filter(u => !u.stripeCustomerId);
        
        usersWithStripe.forEach(u => {
            console.log(`     ✓ ${u.email} -> ${u.stripeCustomerId}`);
        });
        
        console.log(`\n   Users WITHOUT Stripe Customer ID: ${usersWithoutStripe.length}`);
        usersWithoutStripe.forEach(u => {
            console.log(`     ✗ ${u.email}`);
        });

        // Fetch Stripe customers
        console.log('\n🔗 Fetching Stripe Customers...');
        const stripeCustomers = await stripe.customers.list({ limit: 100 });
        
        console.log(`   Found ${stripeCustomers.data.length} customers in Stripe:`);
        stripeCustomers.data.forEach(cust => {
            console.log(`     - ${cust.email || 'NO EMAIL'} (${cust.id})`);
        });

        // Find matches by email
        console.log('\n🔄 Finding matches by email...');
        const matches: { userId: string; userEmail: string; stripeCustomerId: string }[] = [];
        
        for (const user of usersWithoutStripe) {
            const matchingCustomer = stripeCustomers.data.find(
                c => c.email?.toLowerCase() === user.email.toLowerCase()
            );
            if (matchingCustomer) {
                matches.push({
                    userId: user.id,
                    userEmail: user.email,
                    stripeCustomerId: matchingCustomer.id
                });
            }
        }

        if (matches.length > 0) {
            console.log(`\n✅ Found ${matches.length} matchable users by email:`);
            matches.forEach(m => {
                console.log(`   ${m.userEmail} -> ${m.stripeCustomerId}`);
            });

            console.log('\n🔧 Updating local users with Stripe Customer IDs...');
            for (const match of matches) {
                await prisma.user.update({
                    where: { id: match.userId },
                    data: { stripeCustomerId: match.stripeCustomerId }
                });
                console.log(`   ✓ Updated ${match.userEmail}`);
            }
            console.log('\n✅ User-Customer linking complete!');
            console.log('   Please run test-invoice-sync.ts again to sync invoices.');
        } else {
            console.log('\n⚠️ No email matches found between local users and Stripe customers.');
            console.log('   This could mean:');
            console.log('   1. Test users in DB are different from Stripe customers');
            console.log('   2. Stripe is in TEST mode with different test customers');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkStripeCustomers();
