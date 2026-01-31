
import { config } from 'dotenv';
import path from 'path';

// Load Environment
config({ path: path.resolve(__dirname, '../environments/.env.development') });

import prisma from '../src/lib/prisma';

async function main() {
    const key = 'afc_23aea8b11af34151b89a31ad1d1abac11b';
    console.log(`Checking key: ${key}`);

    const app = await prisma.app.findFirst({
        where: { apiKey: key },
        include: { user: true }
    });

    if (app) {
        console.log('--- KEY FOUND ---');
        console.log(`App Name: ${app.name}`);
        console.log(`User Email: ${app.user?.email}`);
        console.log(`User ID: ${app.userId}`);
        console.log(`Is Active: ${app.isActive}`);
    } else {
        console.log('--- KEY NOT FOUND ---');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
