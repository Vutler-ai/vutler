import Image from 'next/image';
import Link from 'next/link';
import { AuthProvider } from '@/lib/auth/auth-context';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#08090f] flex flex-col items-center justify-center px-4 py-12">
        {/* Logo */}
        <div className="mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/vutler-logo-full-white.png"
              alt="Vutler"
              width={140}
              height={36}
              priority
              className="h-9 w-auto"
            />
          </Link>
        </div>

        {/* Card */}
        <div className="w-full max-w-md">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-[#4b5563]">
          © {new Date().getFullYear()} Vutler. All rights reserved.
        </p>
      </div>
    </AuthProvider>
  );
}
