import prisma from '../lib/prisma';
import { Subscription, Plan, Prisma } from '@prisma/client';

export class SubscriptionRepository {
  async findByUserId(userId: string): Promise<(Subscription & { plan: Plan }) | null> {
    return prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<(Subscription & { plan: Plan }) | null> {
    return prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });
  }

  async create(userId: string, planId: string, stripeSubscriptionId?: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.subscription.create({
      data: {
        userId,
        planId,
        status: 'active',
        stripeSubscriptionId,
      },
    });
  }

  async update(id: string, data: Prisma.SubscriptionUpdateInput, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.subscription.update({
      where: { id },
      data,
    });
  }
}
