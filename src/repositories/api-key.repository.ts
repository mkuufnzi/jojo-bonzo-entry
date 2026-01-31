
import prisma from '../lib/prisma';
import { ApiKey, Prisma } from '@prisma/client';

export class ApiKeyRepository {
  async findByUserId(userId: string): Promise<ApiKey[]> {
    return prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findActiveByUserId(userId: string): Promise<ApiKey[]> {
    return prisma.apiKey.findMany({
      where: { 
          userId,
          status: 'active'
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async countByUserId(userId: string): Promise<number> {
      return prisma.apiKey.count({
          where: { userId }
      });
  }

  async create(data: { userId: string, name: string, key: string, scopes?: string }): Promise<ApiKey> {
      return prisma.apiKey.create({
          data: {
              userId: data.userId,
              name: data.name,
              key: data.key,
              scopes: data.scopes || 'full_access',
              status: 'active'
          }
      });
  }

  async delete(id: string, userId: string): Promise<ApiKey> {
      // Use deleteMany to ensure ownership safety (standard Prisma pattern when ID + UserID needed)
      // Actually deleteMany returns BatchPayload. Let's use findFirst then delete for return value or just use deleteMany.
      // Better: delete where id AND userId is not directly supported in 'delete', so use deleteMany for safety.
      // But we probably want to throw if not found.
      
      const key = await prisma.apiKey.findFirst({
            where: { id, userId }
      });

      if (!key) throw new Error('Key not found or unauthorized');

      return prisma.apiKey.delete({
          where: { id }
      });
  }
}
