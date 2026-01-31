/**
 * Feature Access Control Helper
 * 
 * Provides a consistent way to check if a user has access to specific features
 * based on their subscription plan's quotas.
 */

export interface UserWithSubscription {
  id?: string;
  subscription?: {
    plan?: {
      aiQuota?: number | null;
      pdfQuota?: number | null;
      price?: number | null;
      name?: string | null;
      planFeatures?: Array<{
        isEnabled: boolean;
        feature: {
          key: string;
        };
      }>;
    } | null;
  } | null;
  [key: string]: any; // Allow other properties from Prisma User model
}


export class FeatureAccessService {
  /**
   * Check if user has access to AI features
   * Checks both quota AND feature assignment
   */
  static hasAiAccess(user: UserWithSubscription): boolean {
    const planFeatures = user.subscription?.plan?.planFeatures || [];
    const hasFeature = planFeatures.some(pf => pf.feature.key === 'ai_generation' && pf.isEnabled);
    const hasQuota = (user.subscription?.plan?.aiQuota ?? 0) > 0;
    
    return hasFeature || hasQuota;
  }

  /**
   * Check if user has access to a specific feature by key
   */
  static hasFeature(user: UserWithSubscription, featureKey: string): boolean {
    const planFeatures = user.subscription?.plan?.planFeatures || [];
    return planFeatures.some(pf => pf.feature.key === featureKey && pf.isEnabled);
  }

  /**
   * Check if user has access to PDF features
   */
  static hasPdfAccess(user: UserWithSubscription): boolean {
    const planFeatures = user.subscription?.plan?.planFeatures || [];
    const hasFeature = planFeatures.some(pf => pf.feature.key === 'pdf_conversion' && pf.isEnabled);
    const hasQuota = (user.subscription?.plan?.pdfQuota ?? 0) > 0;
    
    return hasFeature || hasQuota;
  }

  /**
   * Check if user is on a paid plan
   */
  static isPaidUser(user: UserWithSubscription): boolean {
    return (user.subscription?.plan?.price ?? 0) > 0;
  }

  /**
   * Get user's plan name
   * @param user User object with subscription
   * @returns Plan name or 'Free' if not set
   */
  static getPlanName(user: UserWithSubscription): string {
    return user.subscription?.plan?.name || 'Free';
  }

  /**
   * Check if user has unlimited access to a feature
   * @param quota The quota value (-1 means unlimited)
   * @returns true if quota is unlimited
   */
  static isUnlimited(quota: number | null | undefined): boolean {
    return quota === -1;
  }

  /**
   * Check if user has reached their AI limit
   */
  static isAiLimitReached(user: any): boolean {
    return !!user.aiLimitReached;
  }

  /**
   * Check if user has reached their PDF limit
   */
  static isPdfLimitReached(user: any): boolean {
    return !!user.pdfLimitReached;
  }
}
