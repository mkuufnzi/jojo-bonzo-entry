
import prisma from '../src/lib/prisma';
import { FeatureAccessService } from '../src/services/feature-access.service';

// Mock Express Request/Response
const mockRes = {
    locals: {
        user: null as any
    },
    status: (code: number) => ({ json: (data: any) => console.log(`[Response ${code}]`, data) }),
    redirect: (url: string) => console.log(`[Redirect] -> ${url}`)
};

async function main() {
    const targetUserId = 'fdeab954-5572-4692-b901-4d20df31906b'; // bwj.afs.tools.test@gmail.com

    console.log(`🔍 Fetching User: ${targetUserId}`);

    const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
            subscription: {
                include: {
                    plan: {
                        include: {
                            planFeatures: {
                                include: {
                                    feature: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!user) {
        console.error('❌ User not found!');
        return;
    }

    console.log(`👤 User Found: ${user.email}`);
    console.log(`   Plan: ${user.subscription?.plan?.name}`);
    console.log(`   AI Quota: ${user.subscription?.plan?.aiQuota}`);
    
    // Inject Computed Flags (Simulating injectUser middleware)
    const anyUser = user as any;
    // @ts-ignore
    anyUser.hasAiAccess = FeatureAccessService.hasAiAccess(user);
    // @ts-ignore
    anyUser.hasPdfAccess = FeatureAccessService.hasPdfAccess(user);
    // @ts-ignore
    anyUser.isPaidUser = FeatureAccessService.isPaidUser(user);
    // @ts-ignore
    anyUser.planName = FeatureAccessService.getPlanName(user);

    mockRes.locals.user = anyUser;

    console.log('\n📊 Injected Flags:');
    console.log(`   hasAiAccess: ${anyUser.hasAiAccess}`);
    console.log(`   isPaidUser: ${anyUser.isPaidUser}`);

    // --- TEST 1: Service Middleware Logic (Open Tool) ---
    console.log('\n🧪 TEST 1: Service Middleware [ai-doc-generator]');
    const serviceSlug = 'ai-doc-generator';
    const requiredFeature = 'ai_generation';

    let hasAccess = false;
    
    // Logic from service.middleware.ts
    if (requiredFeature) {
        if (requiredFeature === 'ai_generation' && anyUser.hasAiAccess) {
             console.log(`   ✅ Access Granted via hasAiAccess`);
             hasAccess = true;
        } else if (typeof anyUser.hasFeature === 'function' && anyUser.hasFeature(requiredFeature)) {
             console.log(`   ✅ Access Granted via hasFeature`);
             hasAccess = true;
        } else if (user.subscription?.plan?.planFeatures) {
             const pf = user.subscription.plan.planFeatures.find((f: any) => f.feature.key === requiredFeature);
             if (pf && pf.isEnabled) {
                  console.log(`   ✅ Access Granted via PlanFeature`);
                  hasAccess = true;
             }
        }
    }

    if (hasAccess) {
        console.log('   🎉 RESULT: ALLOWED');
    } else {
        console.log('   ⛔ RESULT: DENIED (Would Redirect)');
    }


    // --- TEST 2: Feature Middleware Logic (Generate Action) ---
    console.log('\n🧪 TEST 2: Feature Middleware [requireFeature(ai_generation)]');
    
    try {
        // Logic from feature.middleware.ts
        let featureAccess = false;
        if (requiredFeature === 'ai_generation') {
            // @ts-ignore
            featureAccess = FeatureAccessService.hasAiAccess(user);
        } else {
            // @ts-ignore
            featureAccess = FeatureAccessService.hasFeature(user, requiredFeature);
        }

        if (featureAccess) {
             console.log('   🎉 RESULT: ALLOWED');
        } else {
             console.log('   ⛔ RESULT: DENIED');
        }

    } catch (e) {
        console.error(e);
    }

    await prisma.$disconnect();
}

main();
