"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";

export default function SocialMediaCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider");
  const error = searchParams.get("error");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    error ? "error" : "loading"
  );
  const [message, setMessage] = useState(
    error
      ? "Something went wrong while connecting your account. Please try again."
      : "Please wait while we finalize the connection."
  );

  useEffect(() => {
    if (error) {
      return;
    }

    let cancelled = false;
    let redirectTimer: number | null = null;

    async function finalize() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const response = await authFetch("/api/v1/social-media/accounts");
          const data = await response.json();
          const accounts = Array.isArray(data?.data) ? data.data : [];
          const matched = provider
            ? accounts.some((account: { platform?: string }) => account?.platform === provider)
            : accounts.length > 0;
          if (matched) {
            if (cancelled) return;
            setStatus("success");
            setMessage("Your social account has been connected successfully.");
            redirectTimer = window.setTimeout(() => {
              router.push("/settings/integrations/social-media?connected=true");
            }, 1200);
            return;
          }
        } catch {
          // Retry a few times before surfacing an error.
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      if (cancelled) return;
      setStatus("error");
      setMessage(
        provider
          ? `The ${provider} connection did not appear in your workspace after the OAuth return.`
          : "The connected account did not appear in your workspace after the OAuth return."
      );
    }

    void finalize();
    return () => {
      cancelled = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [error, provider, router]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      {status === "loading" && (
        <div>
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-white mb-2">Connecting...</h1>
          <p className="text-[#9ca3af]">{message}</p>
        </div>
      )}
      {status === "success" && (
        <div>
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-white mb-2">Account Connected!</h1>
          <p className="text-[#9ca3af] mb-4">{message}</p>
          <p className="text-sm text-[#6b7280]">Redirecting...</p>
        </div>
      )}
      {status === "error" && (
        <div>
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Connection Failed</h1>
          <p className="text-[#9ca3af] mb-4">{message}</p>
          <Link
            href="/settings/integrations/social-media"
            className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
          >
            Back to Social Media
          </Link>
        </div>
      )}
    </div>
  );
}
