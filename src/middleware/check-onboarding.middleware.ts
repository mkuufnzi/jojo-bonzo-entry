import { Request, Response, NextFunction } from 'express';
import { userProfileService } from '../services/user-profile.service';
import prisma from '../lib/prisma';

export async function checkOnboarding(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }

  try {
    const user = await prisma.user.findUnique({
        where: { id: req.session.userId },
        select: { businessId: true }
    });

    const profile = await prisma.userProfile.findUnique({
        where: { userId: req.session.userId }
    });

    // If user has no business (and is Business Account type) or profile incomplete
    // For now, let's assume if they have a businessId, they are onboarded enough for the dashboard
    // OR if they are INDIVIDUAL, just check profile.
    
    // Simple check: If they are supposed to be a business owner but have no businessId
    if (!user?.businessId && profile?.accountType === 'BUSINESS') {
        return res.redirect('/onboarding/wizard?step=1');
    }
    
    // Explicit flag check from profile
    if (profile && !profile.onboardingCompleted) {
         return res.redirect('/onboarding/wizard?step=1');
    }

    next();
  } catch (error) {
    console.error('Check Onboarding Error:', error);
    next();
  }
}
