import prisma from './src/lib/prisma';
import fs from 'fs';

async function main() {
    let output = '=== FINAL VERIFICATION ===\n';
    
    // 1. Check Services
    const services = await prisma.service.findMany();
    output += '\n1. SERVICES IN DB:\n';
    services.forEach(s => {
        output += `- ${s.name} (${s.slug}): FeatureKey = ${s.requiredFeatureKey}\n`;
    });

    // 2. Check a FREE user
    const freeUser = await prisma.user.findFirst({
        where: { subscription: { plan: { price: 0 } } },
        include: {
            subscription: {
                include: {
                    plan: {
                        include: {
                            planFeatures: {
                                include: { feature: true }
                            }
                        }
                    }
                }
            }
        }
    });

    if (freeUser) {
        output += `\n2. TEST USER: ${freeUser.email} (Plan: ${freeUser.subscription?.plan?.name})\n`;
        
        // Simulating the check logic in AppService/Middleware
        output += '   Simulating Access Checks:\n';
        for (const service of services) {
            const reqFeature = service.requiredFeatureKey;
            let hasAccess = false;
            
            if (!reqFeature) {
                hasAccess = true;
            } else {
                const planFeatures = freeUser.subscription?.plan?.planFeatures || [];
                const pf = planFeatures.find((f: any) => f.feature.key === reqFeature);
                const hasQuota = (reqFeature === 'ai_generation' && (freeUser.subscription?.plan?.aiQuota ?? 0) > 0) ||
                                (reqFeature === 'pdf_conversion' && (freeUser.subscription?.plan?.pdfQuota ?? 0) > 0);
                
                if ((pf && pf.isEnabled) || hasQuota) {
                    hasAccess = true;
                }
            }
            
            output += `   - Access to ${service.slug}: ${hasAccess ? 'ALLOWED' : 'DENIED'} (Required: ${reqFeature || 'None'})\n`;
        }
    } else {
        output += '\n2. NO FREE USER FOUND TO TEST\n';
    }

    // 3. Check for Pro User
    const proUser = await prisma.user.findFirst({
        where: { subscription: { plan: { price: { gt: 0 } } } },
        include: {
            subscription: {
                include: {
                    plan: {
                        include: {
                            planFeatures: {
                                include: { feature: true }
                            }
                        }
                    }
                }
            }
        }
    });

    if (proUser) {
        output += `\n3. PRO USER: ${proUser.email} (Plan: ${proUser.subscription?.plan?.name})\n`;
        output += '   Simulating Access Checks:\n';
        for (const service of services) {
            const reqFeature = service.requiredFeatureKey;
            let hasAccess = false;
            
            if (!reqFeature) {
                hasAccess = true;
            } else {
                const planFeatures = proUser.subscription?.plan?.planFeatures || [];
                const pf = planFeatures.find((f: any) => f.feature.key === reqFeature);
                const hasQuota = (reqFeature === 'ai_generation' && (proUser.subscription?.plan?.aiQuota ?? 0) > 0) ||
                                (reqFeature === 'pdf_conversion' && (proUser.subscription?.plan?.pdfQuota ?? 0) > 0);
                
                if ((pf && pf.isEnabled) || hasQuota) {
                    hasAccess = true;
                }
            }
            output += `   - Access to ${service.slug}: ${hasAccess ? 'ALLOWED' : 'DENIED'} (Required: ${reqFeature || 'None'})\n`;
        }
    }

    fs.writeFileSync('final_verification_output.txt', output);
    console.log('Verification finished, check final_verification_output.txt');
}

main().catch(console.error).finally(() => prisma.$disconnect());
