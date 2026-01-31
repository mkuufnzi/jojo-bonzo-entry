import { UserProfile, AccountType } from '@prisma/client';
import { userProfileRepository, CreateUserProfileData, UpdateUserProfileData } from '../repositories/user-profile.repository';

export interface OnboardingData {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  profession?: string;
  accountType: AccountType;
  businessName?: string;
  businessAddress?: string;
  businessSector?: string;
}

export class UserProfileService {
  /**
   * Create a new user profile (called during registration)
   */
  async createUserProfile(userId: string, data: CreateUserProfileData): Promise<UserProfile> {
    try {
      // Validate required fields
      if (!data.firstName || data.firstName.trim().length < 2) {
        throw new Error('First name must be at least 2 characters');
      }
      if (!data.lastName || data.lastName.trim().length < 2) {
        throw new Error('Last name must be at least 2 characters');
      }

      // Validate business fields if account type is BUSINESS
      if (data.accountType === 'BUSINESS') {
        this.validateBusinessFields(data);
      }

      return await userProfileRepository.create(userId, data);
    } catch (error: any) {
      console.error('[UserProfileService] CreateUserProfile error:', error);
      throw error;
    }
  }

  /**
   * Get user profile by userId
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await userProfileRepository.findByUserId(userId);
    } catch (error) {
      console.error('[UserProfileService] GetUserProfile error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, data: UpdateUserProfileData): Promise<UserProfile> {
    try {
      // Validate if provided
      if (data.firstName && data.firstName.trim().length < 2) {
        throw new Error('First name must be at least 2 characters');
      }
      if (data.lastName && data.lastName.trim().length < 2) {
        throw new Error('Last name must be at least 2 characters');
      }

      // Validate business fields if changing to BUSINESS or updating business data
      if (data.accountType === 'BUSINESS') {
        this.validateBusinessFields(data);
      }

      return await userProfileRepository.update(userId, data);
    } catch (error) {
      console.error('[UserProfileService] UpdateUserProfile error:', error);
      throw error;
    }
  }

  /**
   * Complete onboarding process
   */
  /**
   * Complete onboarding process
   */
  async completeOnboarding(userId: string, data: OnboardingData): Promise<UserProfile> {
    try {
      // Validate all required fields
      if (!data.firstName || data.firstName.trim().length < 2) {
        throw new Error('First name is required and must be at least 2 characters');
      }
      if (!data.lastName || data.lastName.trim().length < 2) {
        throw new Error('Last name is required and must be at least 2 characters');
      }
      if (!data.accountType) {
        throw new Error('Account type is required');
      }

      // Handle Business Creation
      if (data.accountType === 'BUSINESS') {
        // Dynamic import to avoid cycles if any, though explicit import is better usually.
        // We'll import at top level but for this specific logic:
        const { businessService } = await import('./business.service');
        
        if (!data.businessName || !data.businessSector) {
            throw new Error('Business name and sector are required');
        }

        // Create the Business Entity
        await businessService.createBusiness(userId, {
            name: data.businessName,
            sector: data.businessSector,
            address: data.businessAddress,
            // Map other fields if present in OnboardingData
        });
      }

      // Check if profile exists
      const existingProfile = await userProfileRepository.findByUserId(userId);
      
      const profileData = {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        profession: data.profession,
        accountType: data.accountType,
        onboardingCompleted: true,
      };

      if (!existingProfile) {
        return await userProfileRepository.create(userId, profileData);
      }

      return await userProfileRepository.update(userId, profileData);
    } catch (error) {
      console.error('[UserProfileService] CompleteOnboarding error:', error);
      throw error;
    }
  }

  /**
   * Check if user has completed onboarding
   */
  async hasCompletedOnboarding(userId: string): Promise<boolean> {
    try {
      return await userProfileRepository.checkOnboardingCompleted(userId);
    } catch (error) {
      console.error('[UserProfileService] HasCompletedOnboarding error:', error);
      return false;
    }
  }

  /**
   * Create stub profile for new user (called during registration)
   */
  async createStubProfile(userId: string): Promise<UserProfile> {
    try {
      return await userProfileRepository.create(userId, {
        firstName: '',
        lastName: '',
        accountType: 'INDIVIDUAL',
        onboardingCompleted: false,
      } as any);
    } catch (error: any) {
      // If profile already exists, just return it
      if (error.message === 'User profile already exists') {
        const existing = await userProfileRepository.findByUserId(userId);
        if (existing) return existing;
      }
      console.error('[UserProfileService] CreateStubProfile error:', error);
      throw error;
    }
  }

  // Business validation moved to BusinessService
  // Helper validation
  private validateBusinessFields(data: any) {
      // Basic checks if business fields are present
      if (data.businessName && data.businessName.length < 2) {
          throw new Error('Business name too short');
      }
      // Add more as needed
  }
}

export const userProfileService = new UserProfileService();
