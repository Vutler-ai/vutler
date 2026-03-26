"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  CpuChipIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { getTemplate, install } from "@/lib/api/endpoints/marketplace";
import { getTemplates } from "@/lib/api/endpoints/marketplace";
import type { MarketplaceTemplate } from "@/lib/api/types";

const CATEGORY_ICON: Record<string, string> = {
  "customer support": "🎧", "data analysis": "📊", "code review": "🔍",
  content: "✍️", sales: "🎯", automation: "⚡", custom: "🧩",
  engineering: "⚙️", support: "🎧", marketing: "📈",
};

function getIcon(t: MarketplaceTemplate) {
  return t.config?.icon || CATEGORY_ICON[t.category?.toLowerCase()] || "🤖";
}

function Stars({ rating = 0, size = "sm" }: { rating?: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-4 h-4";
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

function DetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto animate-pulse">
      <div className="h-4 bg-[#14151f] rounded w-32 mb-6" />
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#1e293b] rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-6 bg-[#1e293b] rounded w-1/2" />
                <div className="h-4 bg-[#1e293b] rounded w-1/3" />
                <div className="h-4 bg-[#1e293b] rounded w-2/3" />
              </div>
            </div>
          </div>
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 space-y-3">
            <div className="h-5 bg-[#1e293b] rounded w-24" />
            <div className="h-3 bg-[#1e293b] rounded" />
            <div className="h-3 bg-[#1e293b] rounded w-4/5" />
            <div className="h-3 bg-[#1e293b] rounded w-3/5" />
          </div>
        </div>
        <div className="w-full lg:w-72 h-48 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl" />
      </div>
    </div>
  );
}

export default function TemplateDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [template, setTemplate] = useState<MarketplaceTemplate | null>(null);
  const [similar, setSimilar] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await getTemplate(id);
        const tpl = (data as any).template ?? data;
        setTemplate(tpl);
        // Fetch similar templates from the same category
        try {
          const list = await getTemplates({ category: tpl.category, limit: 4 });
          setSimilar(list.templates.filter((t) => t.id !== id).slice(0, 3));
        } catch {
          setSimilar([]);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleInstall = async () => {
    if (!template) return;
    setInstalling(true);
    try {
      await install(id);
      showToast(`"${template.name}" installed to your workspace`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Install failed", false);
    } finally {
      setInstalling(false);
    }
  };

  if (loading) return <DetailSkeleton />;

  if (notFound || !template) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">😵</p>
        <h2 className="text-lg font-semibold text-white mb-2">Template not found</h2>
        <Link href="/marketplace" className="text-[#3b82f6] hover:underline text-sm">
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  const tags = template.config?.tags ?? [];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-[#9ca3af] hover:text-white mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Back to Marketplace
      </Link>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Header card */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <div className="flex items-start gap-4 flex-wrap">
              <span className="text-5xl">{getIcon(template)}</span>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white mb-1">{template.name}</h1>
                <p className="text-[#9ca3af] text-sm mb-3">
                  by <span className="text-white">{template.author || "Vutler Team"}</span>
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="px-2.5 py-1 bg-[#1e293b] text-[#60a5fa] rounded-md font-medium capitalize">
                    {template.category}
                  </span>
                  <div className="flex items-center gap-1">
                    <Stars rating={template.rating} size="md" />
                    <span className="text-white font-medium ml-1">{(template.rating ?? 0).toFixed(1)}</span>
                    <span className="text-[#6b7280]">({template.review_count ?? 0} reviews)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#9ca3af]">
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {(template.installs ?? 0).toLocaleString()} installs
                  </div>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <span className={`text-2xl font-bold ${(template.price ?? 0) > 0 ? "text-white" : "text-emerald-400"}`}>
                  {(template.price ?? 0) > 0 ? `$${template.price}` : "Free"}
                </span>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {installing ? "Installing..." : "Install to Workspace"}
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Description</h2>
            <div className="text-[#d1d5db] text-sm leading-relaxed whitespace-pre-wrap">
              {template.description}
            </div>
          </div>

          {/* What's included */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">What&apos;s Included</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CpuChipIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">Model</p>
                  <p className="text-sm text-[#9ca3af] font-mono">{template.config.model}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <WrenchScrewdriverIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">Temperature</p>
                  <p className="text-sm text-[#9ca3af] font-mono">{template.config.temperature}</p>
                </div>
              </div>
              {template.config.system_prompt && (
                <div className="flex items-start gap-3">
                  <DocumentTextIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">System Prompt Preview</p>
                    <p className="text-sm text-[#9ca3af] line-clamp-4 italic mt-1">
                      &ldquo;{template.config.system_prompt.slice(0, 300)}
                      {template.config.system_prompt.length > 300 ? "…" : ""}&rdquo;
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 sticky top-20">
            <h3 className="text-sm font-semibold text-white mb-4">Similar Templates</h3>
            {similar.length === 0 ? (
              <p className="text-xs text-[#6b7280]">No similar templates found.</p>
            ) : (
              <div className="space-y-3">
                {similar.map((s) => (
                  <Link
                    key={s.id}
                    href={`/marketplace/${s.id}`}
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-[#1e293b] transition-colors group"
                  >
                    <span className="text-xl shrink-0">{getIcon(s)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-[#3b82f6] transition-colors">
                        {s.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Stars rating={s.rating} />
                        <span className="text-xs text-[#6b7280]">{(s.installs ?? 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
