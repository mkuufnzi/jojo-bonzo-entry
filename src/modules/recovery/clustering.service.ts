/**
 * ClusteringService
 *
 * Auto-segments customers into behavioural clusters based on:
 *   - Lifetime Value (LTV)
 *   - Payment frequency / days-to-pay average
 *   - Risk score
 *   - Outstanding balance magnitude
 *
 * Each cluster maps to ONE DebtCollectionSequence so a business never has to
 * manage sequence assignment manually. Sessions created at enrollment will
 * inherit the cluster's sequence.
 *
 * Architecture:
 *   tenantSync() → ClusteringService.clusterBusiness() → upsert clusters → tag sessions
 */

import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

const p = prisma as any;

// ────────────────────────────────────────────────
// Cluster definition buckets
// ────────────────────────────────────────────────
interface ClusterSpec {
    name: string;
    description: string;
    ruleLogic: Record<string, any>;
}

const DEFAULT_CLUSTERS: ClusterSpec[] = [
    {
        name: 'High-Value VIPs',
        description: 'Customers with LTV > $5,000 — gentle, relationship-preserving tone',
        ruleLogic: { ltvMin: 5000 }
    },
    {
        name: 'Chronic Late Payers',
        description: 'Payment frequency > 45 days average — firmer, escalating tone',
        ruleLogic: { avgPaymentDaysMin: 45 }
    },
    {
        name: 'Standard',
        description: 'Default bucket for all other customers',
        ruleLogic: {}
    }
];

export class ClusteringService {

    /**
     * Main entry point called during tenantSync.
     * 
     * 1. Upserts the three default clusters for the business
     * 2. Loads customer profiles from the local cache (DebtCollectionCustomer)
     * 3. Scores and assigns each customer to a cluster
     * 4. Ensures each cluster has a linked sequence (creates if missing)
     */
    async clusterBusiness(businessId: string): Promise<{ clustered: number; skipped: number }> {
        logger.info({ businessId }, '[Clustering] Starting customer clustering');

        // 1. Ensure default clusters exist and get their IDs
        const clusters = await this.ensureDefaultClusters(businessId);

        // 2. Load all local customer profiles
        const customers = await p.debtCollectionCustomer.findMany({
            where: { businessId, isActive: true },
            include: { profile: true }
        });

        if (customers.length === 0) {
            logger.info({ businessId }, '[Clustering] No customers to cluster yet');
            return { clustered: 0, skipped: 0 };
        }

        // 3. Ensure each cluster has a linked sequence
        await this.ensureClusterSequences(businessId, clusters);

        // 4. Score and tag each customer profile
        let clustered = 0;
        let skipped = 0;

        for (const customer of customers) {
            try {
                const profile = customer.profile;
                if (!profile) { skipped++; continue; }

                const clusterId = this.scoreCustomer(profile, clusters);
                if (!clusterId) { skipped++; continue; }

                // Only update if the assignment changed
                if (profile.clusterId !== clusterId) {
                    await p.debtCollectionCustomerProfile.update({
                        where: { id: profile.id },
                        data: { clusterId }
                    });
                    clustered++;
                }
            } catch (err) {
                logger.warn({ customerId: customer.id, err }, '[Clustering] Failed to score customer');
                skipped++;
            }
        }

        logger.info({ businessId, clustered, skipped }, '[Clustering] ✅ Clustering complete');
        return { clustered, skipped };
    }

    /**
     * Determines which cluster a customer belongs to based on their profile.
     * Returns the clusterId or null if no match.
     */
    private scoreCustomer(profile: any, clusters: any[]): string | null {
        const ltv = profile.lifetimeValue ?? 0;
        const avgDays = profile.paymentFrequencyDays ?? 0;

        // High-Value VIPs first
        const vipCluster = clusters.find(c => c.ruleLogic?.ltvMin && ltv >= c.ruleLogic.ltvMin);
        if (vipCluster) return vipCluster.id;

        // Then chronic late payers
        const chronicsCluster = clusters.find(c => c.ruleLogic?.avgPaymentDaysMin && avgDays >= c.ruleLogic.avgPaymentDaysMin);
        if (chronicsCluster) return chronicsCluster.id;

        // Default bucket
        const defaultCluster = clusters.find(c => !c.ruleLogic?.ltvMin && !c.ruleLogic?.avgPaymentDaysMin);
        return defaultCluster?.id ?? null;
    }

    /**
     * Upserts the canonical three clusters for a business.
     */
    private async ensureDefaultClusters(businessId: string): Promise<any[]> {
        const results: any[] = [];

        for (const spec of DEFAULT_CLUSTERS) {
            let cluster = await p.debtCollectionCluster.findFirst({
                where: { businessId, name: spec.name }
            });

            if (!cluster) {
                cluster = await p.debtCollectionCluster.create({
                    data: {
                        businessId,
                        name: spec.name,
                        description: spec.description,
                        ruleLogic: spec.ruleLogic
                    }
                });
                logger.info({ businessId, clusterId: cluster.id, name: spec.name }, '[Clustering] Created cluster');
            }

            results.push(cluster);
        }

        return results;
    }

    /**
     * For each cluster that has no linked sequence, creates a dedicated sequence
     * based on the cluster's profile (e.g. VIP = gentle, Chronic = firm).
     */
    private async ensureClusterSequences(businessId: string, clusters: any[]): Promise<void> {
        const defaultSeq = await p.debtCollectionSequence.findFirst({
            where: { businessId, isDefault: true }
        });

        for (const cluster of clusters) {
            if (cluster.sequenceId) continue; // already linked

            // Build steps based on cluster profile
            const steps = this.buildStepsForCluster(cluster);

            const seq = await p.debtCollectionSequence.create({
                data: {
                    businessId,
                    name: `${cluster.name} — Auto`,
                    isActive: true,
                    isDefault: false,
                    steps,
                    settings: {
                        gracePeriod: defaultSeq?.settings?.gracePeriod ?? 3,
                        brandVoice: cluster.name.includes('VIP') ? 'empathetic' : 'firm'
                    },
                    rules: cluster.ruleLogic
                }
            });

            await p.debtCollectionCluster.update({
                where: { id: cluster.id },
                data: { sequenceId: seq.id }
            });

            logger.info({ businessId, clusterId: cluster.id, sequenceId: seq.id }, '[Clustering] Linked sequence to cluster');
        }
    }

    /**
     * Builds a step schedule appropriate for the cluster type.
     * VIPs get a gentler, longer schedule. Chronic payers get rapid escalation.
     */
    private buildStepsForCluster(cluster: any): any[] {
        if (cluster.ruleLogic?.ltvMin) {
            // VIP: gentle, spaced out
            return [
                { day: 3,  action: 'email', templateId: 'vip_gentle' },
                { day: 10, action: 'email', templateId: 'vip_reminder' },
                { day: 21, action: 'email', templateId: 'vip_final' }
            ];
        }
        if (cluster.ruleLogic?.avgPaymentDaysMin) {
            // Chronic: rapid escalation
            return [
                { day: 1,  action: 'email', templateId: 'chronic_immediate' },
                { day: 5,  action: 'email', templateId: 'chronic_escalation' },
                { day: 10, action: 'email', templateId: 'chronic_final' }
            ];
        }
        // Standard
        return [
            { day: 3,  action: 'email', templateId: 'reminder_gentle' },
            { day: 7,  action: 'email', templateId: 'reminder_firm' },
            { day: 14, action: 'email', templateId: 'reminder_final' }
        ];
    }

    /**
     * Resolves the best sequence for a session at enrollment time.
     * Checks if the customer has a cluster assignment with a linked sequence.
     * Falls back to the business default sequence.
     */
    async resolveSequenceForCustomer(businessId: string, customerId: string): Promise<string | null> {
        const profile = await p.debtCollectionCustomerProfile.findFirst({
            where: { businessId, customer: { externalId: customerId } },
            include: { cluster: { include: { sequence: true } } }
        });

        const clusteredSeqId = profile?.cluster?.sequence?.id ?? null;
        if (clusteredSeqId) {
            logger.debug({ customerId, sequenceId: clusteredSeqId }, '[Clustering] Resolved cluster sequence');
            return clusteredSeqId;
        }

        // fallback
        const defaultSeq = await p.debtCollectionSequence.findFirst({
            where: { businessId, isDefault: true }
        });
        return defaultSeq?.id ?? null;
    }
}

export const clusteringService = new ClusteringService();
