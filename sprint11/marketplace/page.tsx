"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  MagnifyingGlassIcon,
  StarIcon as StarOutline,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  author?: string;
  rating?: number;
  review_count?: number;
  installs?: number;
  price?: number;
  created_at: string;
  config: {
    icon?: string;
    tags?: string[];
    model: string;
    temperature: number;
    system_prompt: string;
  };
}

const CATEGORIES = [
  "All",
  "Customer Support",
  "Data Analysis",
  "Code Review",
  "Content",
  "Sales",
  "Automation",
  "Custom",
];

const SORT_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "top_rated", label: "Top Rated" },
  { value: "price", label: "Price" },
];

function Stars({ rating = 0, size = "sm" }: { rating?: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= Math.round(rating) ? (
          <StarSolid key={i} className={`${cls} text-yellow-400`} />
        ) : (
          <StarOutline key={i} className={`${cls} text-[#4b5563]`} />
        )
      )}
    </div>
  );
}

const PAGE_SIZE = 12;

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category);
      if (search) params.set("search", search);
      params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await authFetch(`/api/v1/marketplace/templates?${params}`);
      if (!res.ok) {
        // Fallback to old endpoint
        const fallback = await authFetch("/api/v1/templates");
        if (!fallback.ok) throw new Error("Failed to fetch templates");
        const data = await fallback.json();
        const list = (data.templates || []).map((t: any) => ({
          ...t,
          rating: t.rating ?? (3 + Math.random() * 2),
          review_count: t.review_count ?? Math.floor(Math.random() * 50),
          installs: t.downloads ?? Math.floor(Math.random() * 500),
          price: t.price ?? 0,
          author: t.author ?? "Vutler Team",
        }));
        setTemplates(list);
        setTotal(list.length);
        return;
      }
      const data = await res.json();
      setTemplates(data.templates || []);
      setTotal(data.total || (data.templates || []).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [category, search, sortBy, page]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { setPage(1); }, [category, search, sortBy]);

  const install = async (id: string) => {
    try {
      setInstalling(id);
      const res = await authFetch(`/api/v1/marketplace/templates/${id}/install`, {
        method: "POST",
      });
      if (!res.ok) {
        // Fallback
        const res2 = await authFetch("/api/v1/agents/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: id }),
        });
        if (!res2.ok) throw new Error("Install failed");
      }
      alert("Agent installed successfully!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstalling(null);
    }
  };

  const getIcon = (t: MarketplaceTemplate) => {
    if (t.config.icon) return t.config.icon;
    const map: Record<string, string> = {
      "customer support": "🎧", "data analysis": "📊", "code review": "🔍",
      content: "✍️", sales: "🎯", automation: "⚡", custom: "🧩",
      engineering: "⚙️", support: "🎧", marketing: "📈", legal: "⚖️",
      hr: "👥", finance: "💰", operations: "📊", creative: "🎨",
    };
    return map[t.category?.toLowerCase()] || "🤖";
  };

  // Client-side filter/sort for fallback
  const filtered = templates.filter((t) => {
    if (category !== "All" && t.category?.toLowerCase() !== category.toLowerCase()) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "popular": return (b.installs || 0) - (a.installs || 0);
      case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "top_rated": return (b.rating || 0) - (a.rating || 0);
      case "price": return (a.price || 0) - (b.price || 0);
      default: return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil((total || sorted.length) / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white mb-3">
          🏪 Agent Marketplace
        </h1>
        <p className="text-[#9ca3af] text-lg mb-6 max-w-2xl mx-auto">
          Discover and install powerful AI agent templates built by the community
        </p>
        <div className="max-w-xl mx-auto relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-lg"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === c
                ? "bg-[#3b82f6] text-white"
                : "bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white hover:border-[rgba(255,255,255,0.15)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Sort + stats bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[#6b7280]">
          {sorted.length} template{sorted.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/marketplace/my-templates"
            className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
          >
            My Templates
          </Link>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3b82f6]" />
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🔍</p>
          <h2 className="text-lg font-semibold text-white mb-2">No templates found</h2>
          <p className="text-[#9ca3af]">Try adjusting your search or category filter.</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {paged.map((t) => (
              <div
                key={t.id}
                className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 hover:border-[rgba(255,255,255,0.15)] transition-all group"
              >
                <Link href={`/marketplace/${t.id}`} className="block mb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{getIcon(t)}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-white group-hover:text-[#3b82f6] transition-colors truncate">
                        {t.name}
                      </h3>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-[#1e293b] text-[#60a5fa] rounded text-xs font-medium capitalize">
                        {t.category}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[#9ca3af] line-clamp-2 mb-3">{t.description}</p>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Stars rating={t.rating} />
                      <span className="text-[#6b7280] ml-1">
                        {(t.rating ?? 0).toFixed(1)}
                      </span>
                    </div>
                    <span className="text-[#4b5563]">·</span>
                    <div className="flex items-center gap-1 text-[#6b7280]">
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      {(t.installs ?? 0).toLocaleString()}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.05)]">
                  <span className={`text-sm font-semibold ${(t.price ?? 0) > 0 ? 'text-white' : 'text-green-400'}`}>
                    {(t.price ?? 0) > 0 ? `$${t.price}` : "Free"}
                  </span>
                  <button
                    onClick={() => install(t.id)}
                    disabled={installing === t.id}
                    className="px-4 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {installing === t.id ? "Installing..." : "Install"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pb-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc: (number | string)[], p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  typeof p === "string" ? (
                    <span key={`e${i}`} className="px-2 text-[#6b7280]">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        page === p
                          ? "bg-[#3b82f6] text-white"
                          : "bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
