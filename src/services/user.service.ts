import { UserRepository } from '../repositories/user.repository';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { AppError } from '../lib/AppError';
import bcrypt from 'bcryptjs';

export class UserService {
    private userRepository: UserRepository;
    private notificationService: NotificationService;
    private emailService: EmailService;

    constructor() {
        this.userRepository = new UserRepository();
        this.notificationService = new NotificationService();
        this.emailService = new EmailService();
    }

    async getProfile(userId: string) {
        return this.userRepository.findById(userId);
    }

    async updateProfile(userId: string, data: { name?: string; email?: string }) {
        const user = await this.userRepository.update(userId, data);
        
        await this.notificationService.notifyUser(userId, 'success', 'Profile Updated', 'Your profile information has been updated.');
        
        return user;
    }

    async updatePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.userRepository.findById(userId);
        if (!user) throw new AppError('User not found', 404);

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            throw new AppError('Incorrect current password', 400);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.userRepository.update(userId, { password: hashedPassword });

        await this.notificationService.notifyUser(userId, 'success', 'Password Changed', 'Your password has been changed successfully.');
        await this.emailService.sendNotification(user.email, 'Password Changed', 'Your password was recently changed. If this wasn\'t you, please contact support immediately.');
    }
}
