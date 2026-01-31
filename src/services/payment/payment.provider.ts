import { User } from '@prisma/client';

export interface CreateSubscriptionResult {
  subscriptionId: string;
  clientSecret?: string; // For frontend confirmation if needed
  status: string; // active, incomplete, etc.
}

export interface PaymentProvider {
  /**
   * Create a customer in the payment provider's system
   * @returns The external customer ID
   */
  createCustomer(user: User): Promise<string>;

  /**
   * Create a subscription for a customer
   */
  createSubscription(
    customerId: string, 
    priceId: string
  ): Promise<CreateSubscriptionResult>;

  /**
   * Cancel a subscription
   */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Create a setup intent to save a payment method
   * @returns client_secret
   */
  createSetupIntent(customerId: string): Promise<string>;
  
  /**
   * Retrieve a payment method details
   */
  getPaymentMethodDetails(paymentMethodId: string): Promise<{
    last4: string;
    brand: string;
    expMonth: number;
    expYear: number;
  }>;

  /**
   * Create a payment intent to charge a card
   */
  createPaymentIntent(
    customerId: string, 
    amount: number, 
    currency: string, 
    paymentMethodId: string
  ): Promise<string>;
}
