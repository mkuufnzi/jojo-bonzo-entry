import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

console.log('--- Connection Verification Start ---');
console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:]+@/, ':***@')}`);
console.log(`REDIS_URL: ${process.env.REDIS_URL?.replace(/:[^:]+@/, ':***@')}`);

async function check() {
    // 1. Check Redis
    console.log('\nTesting Redis Connection...');
    try {
        const redis = new Redis(process.env.REDIS_URL!);
        await redis.ping();
        console.log('✅ Redis Connection Successful');
        redis.disconnect();
    } catch (error: any) {
        console.error('❌ Redis Connection Failed:', error.message);
    }

    // 2. Check Postgres
    console.log('\nTesting Postgres Connection...');
    const prisma = new PrismaClient();
    try {
        await prisma.$connect();
        // Try a simple query
        const count = await prisma.user.count();
        console.log(`✅ Postgres Connection Successful (User count: ${count})`);
    } catch (error: any) {
        console.error('❌ Postgres Connection Failed:', error.message);
    } finally {
        await prisma.$disconnect();
    }

    console.log('\n--- Verification Complete ---');
}

check().catch(console.error);
