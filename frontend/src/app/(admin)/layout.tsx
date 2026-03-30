"use client";


import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  Server,
  Users,
  CreditCard,
  LogOut,
  ChevronLeft,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminFetch,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "@/lib/api/client";

const navigation = [
  { name: "Overview", href: "/admin", icon: BarChart3 },
  { name: "VPS Health", href: "/admin/services", icon: Server },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Plans & Revenue", href: "/admin/plans", icon: CreditCard },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (token) {
      // Verify token is still valid by calling stats
      adminFetch<{ success: boolean }>("/api/v1/admin/stats")
        .then(() => {
          setIsAuthorized(true);
          // Decode email from JWT
          try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            setAdminEmail(payload.email || "");
          } catch { /* ignore */ }
        })
        .catch(() => {
          clearAdminToken();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/v1/admin/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Login failed");
      setAdminToken(data.data.token);
      setAdminEmail(data.data.user.email);
      setIsAuthorized(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoginLoading(false);
    }
  }, [email, password]);

  const handleLogout = () => {
    clearAdminToken();
    setIsAuthorized(false);
    setAdminEmail("");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Login screen
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Shield className="h-12 w-12 text-blue-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Vutler Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Admin credentials required
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-md text-sm"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-md text-sm"
                required
              />
            </div>
            {loginError && (
              <p className="text-sm text-red-400">{loginError}</p>
            )}
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="text-center">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3 w-3 inline mr-1" />
              Back to Vutler
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Link href="/admin" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <span className="font-semibold">Vutler Admin</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t space-y-2">
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground truncate">{adminEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
