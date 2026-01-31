import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { OnboardingStatus } from '@prisma/client';

export interface CreateBusinessData {
  name: string;
  sector: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  website?: string;
  taxId?: string;
  onboardingStatus?: OnboardingStatus;
  currentOnboardingStep?: number;
  metadata?: any;
}

export class BusinessService {
  
  /**
   * Create a new Business/Organization and link to User (Owner)
   */
  async createBusiness(userId: string, data: CreateBusinessData) {
    // 1. Create Business
    const business = await prisma.business.create({
      data: {
        name: data.name,
        sector: data.sector,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        website: data.website,
        taxId: data.taxId,
        onboardingStatus: data.onboardingStatus || OnboardingStatus.NOT_STARTED,
        currentOnboardingStep: data.currentOnboardingStep || 1,
        metadata: data.metadata || {},
        users: {
            connect: { id: userId } // Add owner
        }
      }
    });

    // 2. Link user to this business context
    await prisma.user.update({
        where: { id: userId },
        data: { businessId: business.id }
    });

    return business;
  }

  /**
   * Get Business by ID
   */
  async getBusiness(businessId: string) {
    return await prisma.business.findUnique({
        where: { id: businessId },
        include: {
            users: true,
            integrations: true,
            brandingProfiles: { where: { isDefault: true } }
        }
    });
  }

  /**
   * Get Business associated with a User
   */
  async getBusinessByUserId(userId: string) {
      const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { businessId: true }
      });
      
      if (!user?.businessId) return null;
      
      return this.getBusiness(user.businessId);
  }

  /**
   * Update Business Profile
   */
  async updateBusiness(businessId: string, data: Partial<CreateBusinessData>) {
      return await prisma.business.update({
          where: { id: businessId },
          data: {
              ...data,
              metadata: data.metadata // Ensure metadata is passed if present
          }
      });
  }
}

export const businessService = new BusinessService();
