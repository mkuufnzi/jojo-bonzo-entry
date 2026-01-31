import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { UserRepository } from '../repositories/user.repository';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { AppRepository } from '../repositories/app.repository';
import { PlanRepository } from '../repositories/plan.repository';
import { EmailService } from './email.service';
import { webhookService } from './webhook.service';
import { n8nPayloadFactory } from './n8n/n8n-payload.factory';
import { User } from '@prisma/client';
import { AppError } from '../lib/AppError';

export class AuthService {
  private userRepository: UserRepository;
  private subscriptionRepository: SubscriptionRepository;
  private appRepository: AppRepository;
  private planRepository: PlanRepository;
  private emailService: EmailService;

  constructor() {
    this.userRepository = new UserRepository();
    this.subscriptionRepository = new SubscriptionRepository();
    this.appRepository = new AppRepository();
    this.planRepository = new PlanRepository();
    this.emailService = new EmailService();
  }

  async register(email: string, returnUrl?: string): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    // Use a more robust password generation
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let password = '';
    for (let i = 0; i < 10; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return prisma.$transaction(async (tx) => {
      const user = await this.userRepository.create({
        email,
        password: hashedPassword,
        name: email.split('@')[0],
        isActive: false // Explicitly set false until verified
      }, tx);

      // Reuse initialization logic within transaction
      await this.initializeUserResources(user, tx);

      const verificationToken = uuidv4();

      // Update user with verification token
      await tx.user.update({
        where: { id: user.id },
        data: { verificationToken }
      });
      
      return { user, verificationToken };
    }).then(async ({ user, verificationToken }) => {
      await this.postRegistrationSetup(user);
      await this.emailService.sendVerificationEmail(email, verificationToken, password, returnUrl);
      return user;
    });
  }

  async handleSocialLogin(
    provider: 'google' | 'facebook' | 'linkedin' | 'twitter',
    profileId: string,
    email: string | undefined,
    displayName: string,
    photoUrl: string | undefined
  ): Promise<User> {
    const idField = `${provider}Id`;
    
    // Check if user exists with this provider ID
    let user = await (prisma.user as any).findUnique({
        where: { [idField]: profileId }
    });

    if (user) return user;

    if (!email) {
        throw new AppError(`No email found in ${provider} profile`, 400);
    }

    // Check if user exists with email to link account
    user = await this.userRepository.findByEmail(email);
    if (user) {
        // Link account
        return prisma.user.update({
            where: { id: user.id },
            data: { 
                [idField]: profileId,
                avatar: user.avatar || photoUrl
            }
        });
    }

    // Create new user with subscription and default app
    return prisma.$transaction(async (tx) => {
        const newUser = await this.userRepository.create({
            email,
            [idField]: profileId,
            name: displayName,
            avatar: photoUrl,
            password: '', // Social users might not have a password initially
            emailVerified: new Date(),
            isActive: true // Social auth is inherently verified
        }, tx);

        await this.initializeUserResources(newUser, tx);

        return newUser;
    }).then(async (newUser) => {
        await this.postRegistrationSetup(newUser);
        return newUser;
    });
  }

  /**
   * internal helper to Initialize Subscription and Default App
   * Must be called within a transaction
   */
  private async initializeUserResources(user: User, tx: any) {
      const freePlan = await this.planRepository.findByName('Free');
      if (!freePlan) {
        throw new AppError('Free plan configuration missing', 500);
      }

      await this.subscriptionRepository.create(user.id, freePlan.id, undefined, tx);

      const crypto = require('crypto');
      const apiKey = 'fl_' + crypto.randomBytes(24).toString('hex');

      // Find core services to auto-connect
      const coreServices = await tx.service.findMany({
        where: { slug: { in: ['html-to-pdf', 'ai-doc-generator', 'transactional-branding'] } }
      });

      await this.appRepository.create({
        name: 'Default App',
        user: { connect: { id: user.id } },
        apiKey: apiKey,
        services: {
          create: coreServices.map((s: any) => ({
            serviceId: s.id,
            isEnabled: true
          }))
        }
      }, tx);
  }

  /**
   * Internal helper for post-transaction setup (webhooks, profiles, etc)
   */
  private async postRegistrationSetup(user: User) {
      // Create stub user profile for onboarding
      try {
        const { userProfileService } = await import('./user-profile.service');
        await userProfileService.createStubProfile(user.id);
      } catch (error) {
        console.error('[AuthService] Failed to create User Profile stub:', error);
      }

      // Trigger n8n webhook for new user registration (Standardized)
      const n8nContext = {
          serviceId: 'auth-core',
          serviceTenantId: user.id, // User is the tenant for now until business created
          appId: 'system-auth',
          requestId: `reg_${user.id.substring(0, 8)}`
      };

      const envelope = n8nPayloadFactory.createEventPayload('user_registered', {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt
      }, user.id, n8nContext);

      webhookService.sendTrigger('auth', 'user_registered', envelope);
  }

  async generateTwoFactorCode(userId: string, reason: string = 'Login'): Promise<void> {
    const user = await this.userRepository.findById(userId);
    const crypto = require('crypto');
    const code = crypto.randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await prisma.user.update({
        where: { id: userId },
        data: { 
            twoFactorCurrentCode: code,
            twoFactorCodeExpires: expires
        }
    });

    if (user?.email) {
        await this.emailService.sendTwoFactorCode(user.email, code, reason);
    }
  }

  async verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
      const user = await prisma.user.findUnique({
          where: { id: userId }
      });

      if (!user || !user.twoFactorCurrentCode || !user.twoFactorCodeExpires) {
          return false;
      }

      if (new Date() > user.twoFactorCodeExpires) {
          return false; // Expired
      }

      if (user.twoFactorCurrentCode !== code) {
          return false; // Invalid code
      }

      // Clear code after success
      await prisma.user.update({
          where: { id: userId },
          data: { 
              twoFactorCurrentCode: null,
              twoFactorCodeExpires: null
          }
      });

      return true;
  }

  async enableTwoFactor(userId: string): Promise<void> {
      await prisma.user.update({
          where: { id: userId },
          data: { isTwoFactorEnabled: true }
      });
  }

  async disableTwoFactor(userId: string): Promise<void> {
      await prisma.user.update({
          where: { id: userId },
          data: { 
              isTwoFactorEnabled: false,
              twoFactorCurrentCode: null,
              twoFactorCodeExpires: null
          }
      });
  }

  async verifyEmail(token: string): Promise<User> {
    console.log(`Verifying email with token: ${token}`);
    const user = await prisma.user.findFirst({
        where: { verificationToken: token }
    });

    if (!user) {
        console.error(`Verification failed: Token not found or invalid: ${token}`);
        throw new AppError('Invalid or expired verification token', 400);
    }

    console.log(`User found for verification: ${user.email}`);

    return prisma.user.update({
        where: { id: user.id },
        data: {
            emailVerified: new Date(),
            verificationToken: null,
            isActive: true
        }
    });
  }

  async resetPasswordForUser(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
        console.log(`Password reset requested for non-existent email: ${email}`);
        return;
    }

    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let newPassword = '';
    for (let i = 0; i < 10; i++) {
        newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update DB
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
    });

    // Send Email
    await this.emailService.sendNewPassword(email, newPassword);
  }

  async login(email: string, password: string): Promise<User> {
    console.log(`Login attempt for: ${email}`);
    const user = await this.userRepository.findByEmail(email);
    
    if (!user || !user.password) {
      console.error(`Login failed: User not found or no password set for ${email}`);
      throw new AppError('Invalid email or password', 401);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.error(`Login failed: Password mismatch for ${email}`);
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
        console.warn(`Login failed: User ${email} not verified`);
        throw new AppError('Please verify your email first.', 403);
    }

    console.log(`Login successful for: ${email}`);
    return user;
  }

  async resendVerificationLink(email: string): Promise<void> {
      const user = await this.userRepository.findByEmail(email);
      if (!user) return;
      
      if (user.isActive) {
          throw new AppError('User already verified', 400);
      }

      const verificationToken = uuidv4();
      
      await prisma.user.update({
          where: { id: user.id },
          data: { verificationToken }
      });
      
      await this.emailService.sendVerificationEmail(email, verificationToken);
  }


}
