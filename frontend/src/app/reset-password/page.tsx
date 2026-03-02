"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to reset password");
      }
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6 text-center space-y-4">
        <p className="text-red-400">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#9ca3af] mb-1">New password</label>
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent placeholder-[#6b7280] sm:text-sm"
          placeholder="Min. 8 characters" />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-[#9ca3af] mb-1">Confirm password</label>
        <input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent placeholder-[#6b7280] sm:text-sm"
          placeholder="Repeat password" />
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-[#3b82f6] hover:bg-[#2563eb] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3b82f6] focus:ring-offset-[#0e0f1a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {loading ? "Resetting..." : "Reset password"}
      </button>

      <div className="text-center">
        <Link href="/login" className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors">← Back to login</Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0f1a] px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-white">Set new password</h2>
          <p className="mt-2 text-center text-sm text-[#9ca3af]">Enter your new password below</p>
        </div>
        <Suspense fallback={<div className="text-center text-[#9ca3af]">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
