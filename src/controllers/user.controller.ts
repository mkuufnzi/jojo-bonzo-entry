import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { userProfileService } from '../services/user-profile.service';
import { storageService } from '../services/storage.service';
import prisma from '../lib/prisma';
import { AccountType } from '@prisma/client';

export class UserController {
  static async profile(req: Request, res: Response) {
    const userId = req.session.userId!;
    // We need both User (auth info) and UserProfile (details)
    // userProfileService.getUserProfile fetches the profile. 
    // UserService usually fetches User.
    // Let's rely on what the template expects.
    // Template uses `user` (User model) and `locals.userProfile`.
    // Let's pass `user` and `userProfile` explicitly if needed, but the template seems to use locals or `user`.
    // Current code: `const user = await userService.getProfile(userId);` -> This probably returns User with Profile included?
    // Let's check UserService later if needed, but for now let's just keep the render logic similar but maybe enhanced.
    
    // Re-fetching fresh user data to ensure avatar is up to date
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: { include: { plan: true } }, profile: true }
    });

    res.render('user/profile', { 
      user,
      userProfile: user ? user.profile : null, // Pass profile explicitly for EJS to use locals.userProfile logic if it falls back
      error: null,
      success: req.query.success 
    });
  }

  static async updateProfile(req: Request, res: Response) {
    const userId = req.session.userId!;
    const { 
        firstName, lastName, phoneNumber, profession, 
        businessName, businessSector, businessAddress,
        // Preserve email if passed, though usually read-only
    } = req.body;

    try {
      // 1. Handle Avatar Upload
      if (req.file) {
         const avatarUrl = await storageService.saveFile(userId, req.file.buffer, req.file.originalname, 'profile');
         await prisma.user.update({
             where: { id: userId },
             data: { avatar: avatarUrl }
         });
      }

      // 2. Update Details via UserProfileService
      // We need to know current accountType to pass it validly, OR updateProfile handles partials?
      // userProfileService.updateUserProfile updates the fields passed.
      // AccountType is usually fixed after onboarding, but let's see if we should preserve it.
      // If we don't pass it, does it error? `updateUserProfile` implementation (from memory/context) takes a Partial or complete object?
      // Lets lookup the profile first to get the accountType if needed, or assume service handles it.
      // Easiest is to just pass fields.
      
      // Determine AccountType from existing profile to pass it correctly if valid/required
      const existingProfile = await userProfileService.getUserProfile(userId);
      const accountType = existingProfile?.accountType || AccountType.INDIVIDUAL;

      await userProfileService.updateUserProfile(userId, {
        firstName,
        lastName,
        phoneNumber,
        profession,
        accountType, // Keep existing
        // businessName, // Moved to Business entity
        // businessAddress,
        // businessSector
      });

      res.redirect('/user/profile?success=Profile updated successfully');
    } catch (error: any) {
      console.error('[UserController] Update Error:', error);
      res.redirect(`/user/profile?error=${encodeURIComponent(error.message || 'Failed to update profile')}`);
    }
  }

  static async updatePassword(req: Request, res: Response) {
    const userId = req.session.userId!;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userService = new UserService();

    if (newPassword !== confirmPassword) {
      return res.redirect('/user/profile?error=New passwords do not match');
    }

    try {
      await userService.updatePassword(userId, currentPassword, newPassword);
      res.redirect('/user/profile?success=Password updated successfully');
    } catch (error: any) {
      const message = error.message || 'Failed to update password';
      res.redirect(`/user/profile?error=${encodeURIComponent(message)}`);
    }
  }

  static async toggleTwoFactor(req: Request, res: Response) {
    const userId = req.session.userId!;
    const authService = new AuthService();

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      if (user.isTwoFactorEnabled) {
          await authService.disableTwoFactor(userId);
          res.redirect('/user/profile?success=Two-Factor Authentication disabled');
      } else {
          await authService.enableTwoFactor(userId);
          res.redirect('/user/profile?success=Two-Factor Authentication enabled');
      }
    } catch (error: any) {
      console.error('[UserController] Toggle 2FA Error:', error);
      res.redirect(`/user/profile?error=${encodeURIComponent('Failed to update 2FA settings')}`);
    }
  }
}
