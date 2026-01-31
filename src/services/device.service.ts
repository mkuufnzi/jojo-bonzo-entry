import prisma from '../lib/prisma';
import { Request } from 'express';
import { getClientIp } from 'request-ip';

export class DeviceService {
  
  /**
   * Logs a login attempt (success or failure) and tracks the device if successful.
   */
  async trackLogin(userId: string, req: Request, status: 'SUCCESS' | 'FAILED', reason?: string) {
    const ipAddress = this.getIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';

    try {
        // 1. Log History
        await prisma.loginHistory.create({
            data: {
                userId,
                ipAddress,
                userAgent,
                status,
                reason
            }
        });

        // 2. Track Device (Only on success)
        if (status === 'SUCCESS') {
            await this.upsertDevice(userId, ipAddress, userAgent);
        }
    } catch (error) {
        console.error('[DeviceService] Error tracking login:', error);
        // Don't block the auth flow if logging fails
    }
  }

  private async upsertDevice(userId: string, ipAddress: string, userAgent: string) {
      // Simple heuristic: Same User + Same IP + Same UA = Same Device
      // In production, you might generate a stable deviceID cookie.
      const existingDevice = await prisma.userDevice.findFirst({
            where: {
                userId,
                ipAddress,
                userAgent
            }
      });

      if (existingDevice) {
          await prisma.userDevice.update({
              where: { id: existingDevice.id },
              data: { lastLogin: new Date() }
          });
      } else {
          await prisma.userDevice.create({
              data: {
                  userId,
                  ipAddress,
                  userAgent,
                  isTrusted: false // Default to untrusted until explicit trust logic
              }
          });
      }
  }

  private getIp(req: Request): string {
      // Use request-ip or fallback to connection remoteAddress
      // Since we trust proxy in express, req.ip should be correct if configured.
      // But let's be robust.
      let ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1';
      if (Array.isArray(ip)) ip = ip[0];
      return ip.split(',')[0].trim();
  }
}

export const deviceService = new DeviceService();
