import prisma from '../lib/prisma';
import { Plan } from '@prisma/client';

export class PlanRepository {
  async findByName(name: string): Promise<Plan | null> {
    return prisma.plan.findUnique({
      where: { name },
    });
  }

  async findById(id: string): Promise<Plan | null> {
    return prisma.plan.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<Plan[]> {
    return prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });
  }
}
