import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class PaymentRepository {
  async findDefaultMethod(userId: string) {
    return prisma.paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });
  }

  async findAllMethods(userId: string) {
    return prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' },
    });
  }

  async createMethod(data: Prisma.PaymentMethodCreateInput) {
    return prisma.paymentMethod.create({
      data,
    });
  }

  async findInvoiceById(id: string) {
    return prisma.invoice.findUnique({
      where: { id },
      include: { paymentMethod: true },
    });
  }

  async findPendingInvoice(userId: string, amount: number) {
    return prisma.invoice.findFirst({
      where: {
        userId,
        amount,
        status: 'pending',
        createdAt: { gt: new Date(Date.now() - 60000) }
      }
    });
  }

  async createInvoice(data: Prisma.InvoiceCreateInput) {
    return prisma.invoice.create({
      data,
    });
  }

  async updateInvoiceStatus(id: string, status: string) {
    return prisma.invoice.update({
      where: { id },
      data: { status },
    });
  }

  async findInvoicesByUserId(userId: string, limit: number = 10, skip: number = 0) {
    return prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
      include: {
        subscription: {
          include: {
            plan: true
          }
        }
      }
    });
  }

  async countInvoicesByUserId(userId: string) {
    return prisma.invoice.count({
      where: { userId }
    });
  }

  async deleteMethod(id: string) {
    return prisma.paymentMethod.delete({
      where: { id },
    });
  }

  async updateMethod(id: string, data: Prisma.PaymentMethodUpdateInput) {
    return prisma.paymentMethod.update({
      where: { id },
      data,
    });
  }

  async clearDefaultMethod(userId: string) {
    return prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
}
