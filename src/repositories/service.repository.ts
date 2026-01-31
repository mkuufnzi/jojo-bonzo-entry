import prisma from '../lib/prisma';
import { Service } from '@prisma/client';

export class ServiceRepository {
  async findAllActive(): Promise<Service[]> {
    const services = await prisma.service.findMany({
      where: { isActive: true },
    });
    console.log(`[ServiceRepo] findAllActive found ${services.length} services`);
    return services;
  }

  async findAll(): Promise<Service[]> {
    return prisma.service.findMany();
  }

  async findBySlug(slug: string): Promise<Service | null> {
    const service = await prisma.service.findUnique({
      where: { slug },
    });
    if (service) {
        console.log(`[ServiceRepo] findBySlug('${slug}') found:`, { 
            id: service.id, 
            configKeys: service.config ? Object.keys(service.config as object) : [] 
        });
    } else {
        console.log(`[ServiceRepo] findBySlug('${slug}') -> NOT FOUND`);
    }
    return service;
  }

  async findById(id: string): Promise<Service | null> {
    return prisma.service.findUnique({
      where: { id },
    });
  }

  async findByFeatureKey(featureKey: string): Promise<Service[]> {
    return prisma.service.findMany({
      where: { requiredFeatureKey: featureKey }
    });
  }
}
