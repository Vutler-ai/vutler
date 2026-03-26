"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { getTemplates, install } from "@/lib/api/endpoints/marketplace";
import type { MarketplaceTemplate } from "@/lib/api/types";

const CATEGORIES = ["All", "Customer Support", "Data Analysis", "Code Review", "Content", "Sales", "Automation", "Custom"];
const SORT_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "top_rated", label: "Top Rated" },
  { value: "price", label: "Price" },
];
const PAGE_SIZE = 12;

const CATEGORY_ICON: Record<string, string> = {
  "customer support": "🎧", "data analysis": "📊", "code review": "🔍",
  content: "✍️", sales: "🎯", automation: "⚡", custom: "🧩",
  engineering: "⚙️", support: "🎧", marketing: "📈", legal: "⚖️",
  hr: "👥", finance: "💰", operations: "📊", creative: "🎨",
};

function getIcon(t: MarketplaceTemplate) {
  return t.config?.icon || CATEGORY_ICON[t.category?.toLowerCase()] || "🤖";
}

function Stars({ rating = 0 }: { rating?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= Math.round(rating) ? (
          <StarSolid key={i} className="w-4 h-4 text-yellow-400" />
        ) : (
          <StarOutline key={i} className="w-4 h-4 text-[#4b5563]" />
        )
      )}
    </div>
  );
}

function TemplateSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 bg-[#1e293b] rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#1e293b] rounded w-3/4" />
          <div className="h-3 bg-[#1e293b] rounded w-1/3" />
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-3 bg-[#1e293b] rounded" />
        <div className="h-3 bg-[#1e293b] rounded w-4/5" />
      </div>
      <div className="h-3 bg-[#1e293b] rounded w-1/2" />
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[rgba(255,255,255,0.05)]">
        <div className="h-4 bg-[#1e293b] rounded w-10" />
        <div className="h-7 bg-[#1e293b] rounded w-16" />
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("") ;
  const [sortBy, setSortBy] = useState("popular");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTemplates({ category, search, sort: sortBy, page, limit: PAGE_SIZE });
      setTemplates(data.templates);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [category, search, sortBy, page]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { setPage(1); }, [category, search, sortBy]);

  const handleInstall = async (t: MarketplaceTemplate) => {
    setInstalling(t.id);
    try {
      await install(t.id);
      showToast(`"${t.name}" installed to your workspace`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Install failed", false);
    } finally {
      setInstalling(null);
    }
  };

  // Client-side filter for search/category when API returns full list
  const filtered = templates.filter((t) => {
    if (category !== "All" && t.category?.toLowerCase() !== category.toLowerCase()) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "popular") return (b.installs || 0) - (a.installs || 0);
    if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === "top_rated") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "price") return (a.price || 0) - (b.price || 0);
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil((total || sorted.length) / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white mb-3">Agent Marketplace</h1>
        <p className="text-[#9ca3af] text-lg mb-6 max-w-2xl mx-auto">
          Discover and install powerful AI agent templates
        </p>
        <div className="max-w-xl mx-auto relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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

      {/* Stats + sort bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[#6b7280]">
          {loading ? "Loading..." : `${sorted.length} template${sorted.length !== 1 ? "s" : ""}`}
        </p>
        <div className="flex items-center gap-3">
          <Link href="/marketplace/my-templates" className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
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
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <span>⚠</span> {error}
          <button onClick={fetchTemplates} className="ml-auto text-red-300 hover:text-white underline text-xs">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <TemplateSkeleton key={i} />)}
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🔍</p>
          <h2 className="text-lg font-semibold text-white mb-2">No templates found</h2>
          <p className="text-[#9ca3af]">Try adjusting your search or category filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {paged.map((t) => (
              <div
                key={t.id}
                className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 hover:border-[rgba(255,255,255,0.15)] transition-all group flex flex-col"
              >
                <Link href={`/marketplace/${t.id}`} className="block mb-4 flex-1">
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
                      <span className="text-[#6b7280] ml-1 text-xs">{(t.rating ?? 0).toFixed(1)}</span>
                    </div>
                    <span className="text-[#4b5563]">·</span>
                    <div className="flex items-center gap-1 text-[#6b7280] text-xs">
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      {(t.installs ?? 0).toLocaleString()}
                    </div>
                    {t.author && (
                      <>
                        <span className="text-[#4b5563]">·</span>
                        <span className="text-[#6b7280] text-xs truncate">{t.author}</span>
                      </>
                    )}
                  </div>
                </Link>
                <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.05)]">
                  <span className={`text-sm font-semibold ${(t.price ?? 0) > 0 ? "text-white" : "text-emerald-400"}`}>
                    {(t.price ?? 0) > 0 ? `$${t.price}` : "Free"}
                  </span>
                  <button
                    onClick={() => handleInstall(t)}
                    disabled={installing === t.id}
                    className="px-4 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {installing === t.id ? "Installing..." : "Install"}
                  </button>
                </div>
              </div>
            ))}
          </div>

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
