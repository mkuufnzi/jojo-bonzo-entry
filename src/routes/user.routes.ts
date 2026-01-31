import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middleware/session.middleware';
import { imageUpload, handleImageUploadError } from '../middleware/image-upload.middleware';

const router = Router();

router.use(requireAuth);

router.get('/profile', UserController.profile);
router.post('/profile', imageUpload, handleImageUploadError, UserController.updateProfile);
router.post('/password', UserController.updatePassword);
router.post('/2fa/toggle', UserController.toggleTwoFactor);

export default router;
