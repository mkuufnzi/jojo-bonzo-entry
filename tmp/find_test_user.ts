import prisma from '../src/lib/prisma';

async function findUser() {
    const profile = await (prisma as any).brandingProfile.findFirst({
        include: { user: true, business: true }
    });
    if (profile) {
        console.log(`FOUND: userId=${profile.userId}, businessId=${profile.businessId}`);
    } else {
        console.log('NO_PROFILE_FOUND');
    }
}

findUser();
