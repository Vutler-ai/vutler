import { apiFetch } from '../client';
import type {
  PlansResponse,
  Subscription,
  CheckoutPayload,
  CheckoutResponse,
  PortalResponse,
  SuccessResponse,
} from '../types';

export async function getPlans(): Promise<PlansResponse> {
  return apiFetch<PlansResponse>('/api/v1/billing/plans');
}

export async function getSubscription(): Promise<Subscription | null> {
  try {
    return await apiFetch<Subscription>('/api/v1/billing/subscription');
  } catch {
    return null;
  }
}

export async function checkout(
  planId: string,
  interval: 'monthly' | 'yearly'
): Promise<CheckoutResponse> {
  const payload: CheckoutPayload = {
    planId,
    interval,
    successUrl: typeof window !== 'undefined' ? window.location.href : '',
    cancelUrl: typeof window !== 'undefined' ? window.location.href : '',
  };
  return apiFetch<CheckoutResponse>('/api/v1/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function portal(): Promise<PortalResponse> {
  return apiFetch<PortalResponse>('/api/v1/billing/portal', {
    method: 'POST',
  });
}

export async function changePlan(planId: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/billing/change-plan', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}
