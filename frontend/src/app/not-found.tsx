import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#08090f] px-4 text-center">
      <div className="mb-6 select-none font-mono text-8xl font-bold text-white/5">404</div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Page not found</h1>
      <p className="mb-8 max-w-sm text-sm text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
