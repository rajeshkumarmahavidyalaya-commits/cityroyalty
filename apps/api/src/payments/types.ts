import type { CheckoutResultDTO, PaymentProvider } from '@cityroyalty/shared';

export interface PaymentRequest {
  orderNumber: string;
  amount: number; // paise
  currency: 'INR';
  email: string;
  name: string;
  phone: string;
}
export interface CreatedPayment {
  providerOrderId: string;
  client: CheckoutResultDTO['payment'];
}
export interface VerifyResult {
  status: 'paid' | 'failed' | 'pending';
  providerPaymentId?: string;
  amount?: number;
  reason?: string;
}
export interface WebhookEvent {
  eventId: string;
  type: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  orderNumber?: string;
  amount?: number;
  outcome: 'paid' | 'failed' | 'ignored';
  reason?: string;
}

export interface PaymentAdapter {
  name: PaymentProvider;
  createPayment(req: PaymentRequest): Promise<CreatedPayment>;
  /** Verifies what the browser reports after the hosted checkout (signature / server-side fetch). */
  verifyClientPayment(args: { providerOrderId: string; payload: Record<string, string> }): Promise<VerifyResult>;
  /** Throws if the signature is invalid. */
  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent;
  refund(args: { providerPaymentId: string; amount: number; reason: string }): Promise<{ providerRefundId: string }>;
}
