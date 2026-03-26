import { apiFetch } from '../client';
import type {
  PlansResponse,
  Subscription,
  CheckoutPayload,
  CheckoutResponse,
  PortalResponse,
  SuccessResponse,
} from '../types';

// ── Internal response wrappers (backend always returns { success, data }) ─────
interface WrappedPlans { success: boolean; data: PlansResponse }
interface WrappedSubscription { success: boolean; data: Subscription }
interface WrappedUrl { success: boolean; data: { url: string } }

export async function getPlans(): Promise<PlansResponse> {
  const res = await apiFetch<WrappedPlans | PlansResponse>('/api/v1/billing/plans');
  // Unwrap { success, data } envelope if present
  if (res && 'data' in res && typeof (res as WrappedPlans).data === 'object') {
    return (res as WrappedPlans).data;
  }
  return res as PlansResponse;
}

export async function getSubscription(): Promise<Subscription | null> {
  try {
    const res = await apiFetch<WrappedSubscription | Subscription>('/api/v1/billing/subscription');
    if (!res) return null;
    // Unwrap { success, data } envelope if present
    if ('data' in res && res.data && typeof res.data === 'object') {
      return (res as WrappedSubscription).data as Subscription;
    }
    return res as Subscription;
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
  const res = await apiFetch<WrappedUrl | CheckoutResponse>('/api/v1/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // Unwrap { success, data: { url } } if present
  if (res && 'data' in res && (res as WrappedUrl).data?.url) {
    return (res as WrappedUrl).data as CheckoutResponse;
  }
  return res as CheckoutResponse;
}

export async function portal(): Promise<PortalResponse> {
  const res = await apiFetch<WrappedUrl | PortalResponse>('/api/v1/billing/portal', {
    method: 'POST',
  });
  // Unwrap { success, data: { url } } if present
  if (res && 'data' in res && (res as WrappedUrl).data?.url) {
    return (res as WrappedUrl).data as PortalResponse;
  }
  return res as PortalResponse;
}

export async function changePlan(planId: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/billing/change-plan', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}
