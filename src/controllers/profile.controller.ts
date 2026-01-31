import { Request, Response, NextFunction } from 'express';
import { userProfileService } from '../services/user-profile.service';
import { AccountType } from '@prisma/client';
import { storageService } from '../services/storage.service';
import prisma from '../lib/prisma';
// import { businessService } from '../services/business.service'; // Indirectly used via user-profile.service

export class ProfileController {
  /**
   * GET /profile - Show profile page
   */
  static async showProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId;
      
      if (!userId) {
        return res.redirect('/auth/login');
      }

      const profile = await userProfileService.getUserProfile(userId);
      
      res.render('user/profile', {
        user: res.locals.user,
        profile,
        title: 'My Profile'
      });
    } catch (error) {
      console.error('[ProfileController] ShowProfile error:', error);
      next(error);
    }
  }

  /**
   * POST /profile/onboarding - Complete onboarding
   */
  static async submitOnboarding(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      // Handle Form Data (Multipart) - req.body is populated by multer
      const { firstName, lastName, phoneNumber, profession, accountType, businessName, businessAddress, businessSector } = req.body;

      // Handle File Upload (Logo/Portrait)
      let avatarUrl: string | undefined;
      // Note: Multer middleware populates req.file
      if (req.file) {
        // req.file.buffer is available because we used memoryStorage in the first middleware, 
        // BUT wait, my middleware uses memoryStorage? 
        // Yes, image-upload.middleware.ts uses memoryStorage. 
        // So req.file.buffer is available.
        // Wait, did I set up storageService to use buffer? Yes.
        
        avatarUrl = await storageService.saveFile(userId, req.file.buffer, req.file.originalname, 'profile');
        
        // Update User avatar
        await prisma.user.update({
            where: { id: userId },
            data: { avatar: avatarUrl }
        });
      }

      // Validate required fields (Manual validation since body is form-data strings)
      if (!firstName || !lastName || !accountType) {
        return res.status(400).json({
          success: false,
          error: 'First name, last name, and account type are required'
        });
      }

      // Validate business fields if BUSINESS account
      if (accountType === 'BUSINESS' && (!businessName || !businessSector)) {
        return res.status(400).json({
          success: false,
          error: 'Business name and sector are required for business accounts'
        });
      }

      const profile = await userProfileService.completeOnboarding(userId, {
        firstName,
        lastName,
        phoneNumber,
        profession,
        accountType: accountType as AccountType,
        businessName,
        businessAddress,
        businessSector,
      });

      res.json({
        success: true,
        message: 'Onboarding completed successfully',
        profile,
        avatarUrl
      });
    } catch (error: any) {
      console.error('[ProfileController] SubmitOnboarding error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to complete onboarding'
      });
    }
  }

  /**
   * GET /api/profile - Get profile data (API)
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const profile = await userProfileService.getUserProfile(userId);
      
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      res.json({
        success: true,
        profile
      });
    } catch (error: any) {
      console.error('[ProfileController] GetProfile error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch profile'
      });
    }
  }

  /**
   * PUT /api/profile - Update profile
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const { firstName, lastName, phoneNumber, profession, accountType, businessName, businessAddress, businessSector } = req.body;

      // Handle File Upload (Logo/Portrait)
      let avatarUrl: string | undefined;
      if (req.file) {
        avatarUrl = await storageService.saveFile(userId, req.file.buffer, req.file.originalname, 'profile');
        await prisma.user.update({
            where: { id: userId },
            data: { avatar: avatarUrl }
        });
      }

      const profile = await userProfileService.updateUserProfile(userId, {
        firstName,
        lastName,
        phoneNumber,
        profession,
        accountType: accountType as any, 
        // businessName, // Moved to Business Entity
        // businessAddress,
        // businessSector,
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        profile,
        avatarUrl
      });
    } catch (error: any) {
      console.error('[ProfileController] UpdateProfile error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update profile'
      });
    }
  }
}
