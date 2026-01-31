import prisma from '../lib/prisma';
import { UserProfile, AccountType } from '@prisma/client';

export interface CreateUserProfileData {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  profession?: string;
  accountType?: AccountType;
}

export interface UpdateUserProfileData extends Partial<CreateUserProfileData> {
  onboardingCompleted?: boolean;
}

export class UserProfileRepository {
  /**
   * Create a new user profile
   */
  async create(userId: string, data: CreateUserProfileData): Promise<UserProfile> {
    try {
      return await prisma.userProfile.create({
        data: {
          userId,
          ...data,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('User profile already exists');
      }
      if (error.code === 'P2003') {
        throw new Error('User not found');
      }
      console.error('[UserProfileRepository] Create error:', error);
      throw error;
    }
  }

  /**
   * Find profile by userId
   */
  async findByUserId(userId: string): Promise<UserProfile | null> {
    try {
      return await prisma.userProfile.findUnique({
        where: { userId },
      });
    } catch (error) {
      console.error('[UserProfileRepository] FindByUserId error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async update(userId: string, data: UpdateUserProfileData): Promise<UserProfile> {
    try {
      return await prisma.userProfile.update({
        where: { userId },
        data,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error('User profile not found');
      }
      console.error('[UserProfileRepository] Update error:', error);
      throw error;
    }
  }

  /**
   * Mark onboarding as completed
   */
  async markOnboardingComplete(userId: string): Promise<void> {
    try {
      await prisma.userProfile.update({
        where: { userId },
        data: { onboardingCompleted: true },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error('User profile not found');
      }
      console.error('[UserProfileRepository]  MarkOnboardingComplete error:', error);
      throw error;
    }
  }

  /**
   * Check if onboarding is completed
   */
  async checkOnboardingCompleted(userId: string): Promise<boolean> {
    try {
      const profile = await prisma.userProfile.findUnique({
        where: { userId },
        select: { onboardingCompleted: true },
      });
      return profile?.onboardingCompleted || false;
    } catch (error) {
      console.error('[UserProfileRepository] CheckOnboardingCompleted error:', error);
      return false;
    }
  }

  /**
   * Delete user profile (cascade will handle this on user deletion, but provided for completeness)
   */
  async delete(userId: string): Promise<void> {
    try {
      await prisma.userProfile.delete({
        where: { userId },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        // Profile doesn't exist, silently ignore
        return;
      }
      console.error('[UserProfileRepository] Delete error:', error);
      throw error;
    }
  }
}

export const userProfileRepository = new UserProfileRepository();
