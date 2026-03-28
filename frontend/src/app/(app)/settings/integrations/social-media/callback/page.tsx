"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SocialMediaCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      setStatus("error");
      return;
    }

    setStatus("success");
    // Auto-redirect after 2s
    const timer = setTimeout(() => {
      router.push("/settings/integrations/social-media?connected=true");
    }, 2000);
    return () => clearTimeout(timer);
  }, [searchParams, router]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      {status === "loading" && (
        <div>
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-white mb-2">Connecting...</h1>
          <p className="text-[#9ca3af]">Please wait while we finalize the connection.</p>
        </div>
      )}
      {status === "success" && (
        <div>
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-white mb-2">Account Connected!</h1>
          <p className="text-[#9ca3af] mb-4">Your social account has been connected successfully.</p>
          <p className="text-sm text-[#6b7280]">Redirecting...</p>
        </div>
      )}
      {status === "error" && (
        <div>
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Connection Failed</h1>
          <p className="text-[#9ca3af] mb-4">
            Something went wrong while connecting your account. Please try again.
          </p>
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
