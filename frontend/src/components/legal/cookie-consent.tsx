'use client';

import Link from 'next/link';
import Script from 'next/script';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const CONSENT_STORAGE_KEY = 'vutler.cookie-consent';
const CONSENT_COOKIE_NAME = 'vutler_cookie_consent';
const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
const UMAMI_SCRIPT_ID = 'vutler-umami-script';
const UMAMI_WEBSITE_ID = '223241c1-605f-4afe-8dc7-3a8a59c06d68';
const CONSENT_CHANGE_EVENT = 'vutler-cookie-consent-change';

type CookiePreferences = {
  essential: true;
  analytics: boolean;
  updatedAt: string;
};

type CookieConsentContextValue = {
  isReady: boolean;
  preferences: CookiePreferences | null;
  openPreferences: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  savePreferences: (analytics: boolean) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);
let cachedConsentSource: string | null = null;
let cachedConsentPreferences: CookiePreferences | null = null;

function buildPreferences(analytics: boolean): CookiePreferences {
  return {
    essential: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
}

function parsePreferences(value: string | null): CookiePreferences | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<CookiePreferences>;
    if (typeof parsed.analytics !== 'boolean') return null;
    if (typeof parsed.updatedAt !== 'string') return null;
    return {
      essential: true,
      analytics: parsed.analytics,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function persistPreferences(preferences: CookiePreferences) {
  const payload = JSON.stringify(preferences);

  cachedConsentSource = payload;
  cachedConsentPreferences = preferences;

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, payload);
  } catch {}

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(payload)}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

function loadStoredPreferences(): CookiePreferences | null {
  let serializedPreferences: string | null = null;

  try {
    serializedPreferences = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {}

  if (!serializedPreferences) {
    const cookieEntry = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`));

    if (cookieEntry) {
      serializedPreferences = decodeURIComponent(cookieEntry.split('=').slice(1).join('='));
    }
  }

  if (serializedPreferences === cachedConsentSource) {
    return cachedConsentPreferences;
  }

  const parsedPreferences = parsePreferences(serializedPreferences);
  cachedConsentSource = serializedPreferences;
  cachedConsentPreferences = parsedPreferences;
  return parsedPreferences;
}

function subscribeToConsent(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(CONSENT_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(CONSENT_CHANGE_EVENT, onStoreChange);
  };
}

function getConsentSnapshot() {
  return loadStoredPreferences();
}

function getServerConsentSnapshot() {
  return undefined as CookiePreferences | null | undefined;
}

function syncUmami(enableAnalytics: boolean) {
  if (enableAnalytics) return;

  const existing = document.getElementById(UMAMI_SCRIPT_ID);
  if (existing) existing.remove();

  if ('umami' in window) {
    delete (window as Window & { umami?: unknown }).umami;
  }
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const storedPreferences = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getServerConsentSnapshot
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);
  const isReady = storedPreferences !== undefined;
  const preferences = storedPreferences ?? null;

  useEffect(() => {
    if (!isReady) return;
    syncUmami(Boolean(preferences?.analytics));
  }, [isReady, preferences?.analytics]);

  const value = useMemo<CookieConsentContextValue>(() => ({
    isReady,
    preferences,
    openPreferences: () => {
      setAnalyticsDraft(preferences?.analytics ?? false);
      setDialogOpen(true);
    },
    acceptAll: () => {
      const next = buildPreferences(true);
      persistPreferences(next);
      setDialogOpen(false);
    },
    rejectOptional: () => {
      const next = buildPreferences(false);
      persistPreferences(next);
      setDialogOpen(false);
    },
    savePreferences: (analytics) => {
      const next = buildPreferences(analytics);
      persistPreferences(next);
      setDialogOpen(false);
    },
  }), [isReady, preferences]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}

      {preferences?.analytics ? (
        <Script
          id={UMAMI_SCRIPT_ID}
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id={UMAMI_WEBSITE_ID}
          strategy="afterInteractive"
        />
      ) : null}

      {isReady && !preferences ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#08090f]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-white">Cookie and analytics preferences</p>
              <p className="mt-1 text-sm leading-6 text-white/65">
                We always use essential cookies required for authentication, security, and workspace state.
                Analytics is optional and stays off until you accept it. See our{' '}
                <Link href="/cookies" className="text-blue-300 hover:text-blue-200">
                  Cookie Policy
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-blue-300 hover:text-blue-200">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-white/15 bg-transparent text-white hover:bg-white/10"
                onClick={value.openPreferences}
              >
                Manage
              </Button>
              <Button
                variant="outline"
                className="border-white/15 bg-transparent text-white hover:bg-white/10"
                onClick={value.rejectOptional}
              >
                Reject optional
              </Button>
              <Button className="bg-blue-600 text-white hover:bg-blue-500" onClick={value.acceptAll}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-white/10 bg-[#0c101c] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Privacy preferences</DialogTitle>
            <DialogDescription className="text-white/55">
              Essential cookies stay on because the site and app use them for sign-in, security, and workspace access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">Essential</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">
                    Authentication, session continuity, secure routing, and workspace feature state.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/75">
                  Always active
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">Analytics</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">
                    Privacy-focused product analytics for understanding traffic and improving the public site.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsDraft}
                  onClick={() => setAnalyticsDraft((value) => !value)}
                  className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors ${
                    analyticsDraft
                      ? 'border-blue-500/60 bg-blue-600'
                      : 'border-white/15 bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white transition-transform ${
                      analyticsDraft ? 'translate-x-[24px]' : 'translate-x-0.5'
                    }`}
                  />
                  <span className="sr-only">Toggle analytics consent</span>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/10"
              onClick={value.rejectOptional}
            >
              Reject optional
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/10"
              onClick={value.acceptAll}
            >
              Accept all
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-500" onClick={() => value.savePreferences(analyticsDraft)}>
              Save choices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);

  if (!context) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }

  return context;
}
