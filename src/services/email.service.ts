import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { emailTemplateService } from './email-template.service';

export class EmailService {
  private transporter: nodemailer.Transporter;
  private isVerified: boolean = false;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(config.SMTP_PORT || '587'),
      secure: config.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }

  private async ensureTransporter() {
     if (!config.SMTP_USER) {
        if (!this.isVerified) {
          const testAccount = await nodemailer.createTestAccount();
          this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
          console.log('[EmailService] Generated Ethereal Test Account:', testAccount.user);
          this.isVerified = true;
        }
        return;
      }

      if (!this.isVerified && config.NODE_ENV === 'production') {
        try {
          await this.transporter.verify();
          console.log('[EmailService] SMTP connection verified successfully');
          this.isVerified = true;
        } catch (err) {
          console.error('[EmailService] SMTP verification failed:', err);
          throw new Error('Email service is currently unavailable. Please contact support.');
        }
      }
  }

  async sendNotificationEmail(to: string, subject: string, text: string, link?: string) {
    await this.ensureTransporter();
    let body = text;
    let html = `<p>${text}</p>`;

    if (link) {
        body += `\n\nLink: ${link}`;
        html += `<p><a href="${link}">View Details</a></p>`;
    }

    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';
    
    try {
        const info = await this.transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject: `[Notification] ${subject}`,
            text: body,
            html: html,
        });
        console.log('[EmailService] User Notification sent to %s: %s', to, info.messageId);
        return info;
    } catch (error) {
        console.error('[EmailService] Error sending user notification email:', error);
        throw error;
    }
  }

  async sendNewPassword(to: string, password: string) {
    await this.ensureTransporter();
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: 'Your New Password',
        text: `Your password has been reset. Your new password is: ${password}\n\nPlease login and change it if you wish.`,
        html: emailTemplateService.renderPasswordReset(password),
      });
      console.log('[EmailService] New password sent to %s: %s', to, info.messageId);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending new password email:', error);
      throw error;
    }
  }

  async sendNotification(subject: string, text: string, html?: string) {
    await this.ensureTransporter();
    const recipients = config.NOTIFICATION_EMAILS?.split(',') || [];
    
    if (recipients.length === 0) {
      console.warn('[EmailService] No notification recipients configured (NOTIFICATION_EMAILS).');
      console.log(`[EmailService] [Notification Log] Subject: ${subject}\nBody: ${text}`);
      return;
    }

    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipients.join(','),
        subject: `[Floovioo Notification] ${subject}`,
        text,
        html: html || text,
      });
      console.log('[EmailService] Admin Notification sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending notification:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    await this.ensureTransporter();
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Welcome to Floovioo ',
        text: `Hello ${name},\n\nWelcome to Floovioo ! We are excited to help you automate your document workflows.\n\nBest regards,\nThe Floovioo Team`,
        html: emailTemplateService.renderWelcomeEmail(name),
      });

      console.log('[EmailService] Welcome email sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending welcome email:', error);
      return null;
    }
  }

  async sendPasswordEmail(email: string, password: string) {
    await this.ensureTransporter();
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Your Account Password',
        text: `Hello,\n\nYour account has been created. Your password is: ${password}\n\nPlease login and change it immediately.\n\nBest regards,\nThe Team`,
        html: `<p>Hello,</p><p>Your account has been created. Your password is: <strong>${password}</strong></p><p>Please login and change it immediately.</p><p>Best regards,<br>The Team</p>`,
      });

      console.log('[EmailService] Password email sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending password email:', error);
      return null;
    }
  }

  async sendVerificationEmail(email: string, token: string, password?: string, returnUrl?: string) {
    await this.ensureTransporter();
    
    let verifyUrl = `${config.APP_URL}/auth/verify?token=${token}`;
    if (returnUrl) {
        verifyUrl += `&returnUrl=${encodeURIComponent(returnUrl)}`;
    }
    
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    let htmlContent = `<p>Hello,</p><p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`;
    let textContent = `Hello,\n\nPlease verify your email address by clicking the link below:\n${verifyUrl}`;

    if (password) {
        htmlContent += `<p>Your temporary password is: <strong>${password}</strong></p>`;
        textContent += `\n\nYour temporary password is: ${password}`;
    }

    htmlContent += `<p>Best regards,<br>${fromName}</p>`;
    textContent += `\n\nBest regards,\n${fromName}`;

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: 'Verify your email',
        text: textContent,
        html: emailTemplateService.renderVerificationEmail(verifyUrl, password),
      });

      console.log('[EmailService] Verification email sent to %s: %s', email, info.messageId);
      if (info.messageId && config.NODE_ENV !== 'production') {
          console.log('[EmailService] Preview URL: %s', nodemailer.getTestMessageUrl(info));
      }
      
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending verification email:', error);
      throw error;
    }
  }

  async sendTwoFactorCode(email: string, code: string, reason: string = 'Login') {
    await this.ensureTransporter();
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    const subject = reason === 'Login' ? 'Your 2FA Login Code' : `${reason} Verification Code`;
    const actionText = reason === 'Login' ? 'login' : 'action';

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: subject,
        text: `Your ${actionText} verification code is: ${code}\n\nThis code will expire in 10 minutes.`,
        html: emailTemplateService.renderTwoFactorCode(code, reason),
      });

      console.log('[EmailService] 2FA code sent to %s: %s (Reason: %s)', email, info.messageId, reason);
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending 2FA code:', error);
      throw error;
    }
  }

  async sendPdf(to: string, pdfBuffer: Buffer, filename: string = 'document.pdf') {
    await this.ensureTransporter();
    const fromName = config.FROM_NAME || 'Flozino';
    const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';

    try {
        const info = await this.transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject: 'Your PDF Document is Ready',
            text: 'Please find attached your generated PDF document.',
            html: '<p>Please find attached your generated PDF document.</p>',
            attachments: [
                {
                    filename,
                    content: pdfBuffer
                }
            ]
        });
        console.log('[EmailService] PDF Email sent to %s: %s', to, info.messageId);
        return info;
    } catch (error) {
        console.error('[EmailService] Error sending PDF email:', error);
        return null;
    }
  }

  async sendContactEmail(name: string, email: string, message: string) {
      await this.ensureTransporter();
      const fromName = config.FROM_NAME || 'Flozino';
      const fromEmail = config.FROM_EMAIL || 'no-reply@afstools.com';
      const adminEmail = config.NOTIFICATION_EMAILS?.split(',')[0] || config.SMTP_USER;
      
      if (!adminEmail) {
          console.warn('[EmailService] No admin email configured for contact form.');
          return;
      }

      try {
          // Send to Admin
          await this.transporter.sendMail({
              from: `"${fromName}" <${fromEmail}>`,
              to: adminEmail,
              replyTo: email,
              subject: `[Contact Form] New message from ${name}`,
              text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
              html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong><br>${message.replace(/\n/g, '<br>')}</p>`,
          });
          
          // Auto-reply to user
           await this.transporter.sendMail({
              from: `"${fromName}" <${fromEmail}>`,
              to: email,
              subject: `We received your message`,
              text: `Hi ${name},\n\nThanks for reaching out. We have received your message and will get back to you shortly.\n\nBest regards,\nFlozino Team`,
              html: `<p>Hi ${name},</p><p>Thanks for reaching out. We have received your message and will get back to you shortly.</p><p>Best regards,<br>Flozino Team</p>`,
          });
          
          return true;
      } catch (error) {
          console.error('[EmailService] Error sending contact emails:', error);
          throw error;
      }
  }
}

export const emailService = new EmailService();
