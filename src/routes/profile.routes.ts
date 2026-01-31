import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { requireAuth } from '../middleware/session.middleware';

import { imageUpload, handleImageUploadError } from '../middleware/image-upload.middleware';

const router = Router();

// Profile page
router.get('/profile', requireAuth, ProfileController.showProfile);

// Onboarding submission
router.post('/profile/onboarding', 
    requireAuth, 
    imageUpload, 
    handleImageUploadError, 
    ProfileController.submitOnboarding
);

// API endpoints
router.get('/api/profile', requireAuth, ProfileController.getProfile);
router.put('/api/profile', 
    requireAuth, 
    imageUpload, 
    handleImageUploadError, 
    ProfileController.updateProfile
);

export default router;
