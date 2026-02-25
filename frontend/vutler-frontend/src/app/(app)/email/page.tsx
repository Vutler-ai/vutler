"use client";

export default function Email_Page() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email</h1>
          <p className="text-sm text-[#9ca3af]">Coming soon</p>
        </div>
      </div>
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
        <svg className="w-16 h-16 mx-auto text-[#6b7280] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <h2 className="text-lg font-semibold text-white mb-2">Under Construction</h2>
        <p className="text-[#9ca3af] max-w-md mx-auto">This feature is being built. Check back soon.</p>
      </div>
    </div>
  );
}
