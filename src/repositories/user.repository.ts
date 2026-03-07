import prisma from '../lib/prisma';
import { User, Prisma } from '@prisma/client';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async findByIdWithRelations(id: string) {
    return prisma.user.findUnique({
      where: { id },
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
        },
        apps: {
            include: {
                services: {
                    include: { service: true }
                }
            }
        },
        business: true,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput, tx?: Prisma.TransactionClient): Promise<User> {
    const client = tx || prisma;
    return client.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }
}
