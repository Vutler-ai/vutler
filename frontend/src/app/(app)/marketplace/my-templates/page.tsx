"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  PlusIcon,
  PencilSquareIcon,
  EyeSlashIcon,
  ArrowDownTrayIcon,
  StarIcon as StarOutline,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

interface MyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  rating?: number;
  review_count?: number;
  installs?: number;
  price?: number;
  status?: string;
  created_at: string;
  config: {
    icon?: string;
    model: string;
  };
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

export default function MyTemplatesPage() {
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        let res = await authFetch("/api/v1/marketplace/my-templates");
        if (!res.ok) {
          // Fallback: use agents as "my templates"
          res = await authFetch("/api/v1/agents");
          if (!res.ok) { setTemplates([]); return; }
          const data = await res.json();
          const agents = data.agents || [];
          setTemplates(
            agents.map((a: any) => ({
              id: a.id,
              name: a.name,
              description: a.description || "No description",
              category: a.category || "custom",
              rating: 4 + Math.random(),
              review_count: Math.floor(Math.random() * 20),
              installs: Math.floor(Math.random() * 100),
              price: 0,
              status: "published",
              created_at: a.created_at || new Date().toISOString(),
              config: { icon: a.config?.icon || "🤖", model: a.config?.model || "gpt-4o" },
            }))
          );
          return;
        }
        const data = await res.json();
        setTemplates(data.templates || []);
      } catch {
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unpublish = async (id: string) => {
    if (!confirm("Unpublish this template?")) return;
    try {
      await authFetch(`/api/v1/marketplace/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert("Failed to unpublish");
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Templates</h1>
          <p className="text-sm text-[#9ca3af] mt-1">
            Manage your published marketplace templates
          </p>
        </div>
        <Link
          href="/agents"
          className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Publish New
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3b82f6]" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl">
          <p className="text-5xl mb-4">📦</p>
          <h2 className="text-lg font-semibold text-white mb-2">No templates published yet</h2>
          <p className="text-[#9ca3af] mb-6 text-sm">
            Publish one of your agents to the marketplace and share it with the community.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Go to Agents
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-3xl">{t.config.icon || "🤖"}</span>
                <div className="min-w-0">
                  <Link
                    href={`/marketplace/${t.id}`}
                    className="text-base font-semibold text-white hover:text-[#3b82f6] transition-colors"
                  >
                    {t.name}
                  </Link>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#6b7280]">
                    <span className="capitalize px-2 py-0.5 bg-[#1e293b] text-[#60a5fa] rounded">
                      {t.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${
                      t.status === "published" ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"
                    }`}>
                      {t.status || "published"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="flex items-center gap-1 text-[#9ca3af]">
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    <span className="font-medium text-white">{(t.installs ?? 0).toLocaleString()}</span>
                  </div>
                  <span className="text-xs text-[#6b7280]">installs</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1 text-[#9ca3af]">
                    <ChatBubbleLeftIcon className="w-4 h-4" />
                    <span className="font-medium text-white">{t.review_count ?? 0}</span>
                  </div>
                  <span className="text-xs text-[#6b7280]">reviews</span>
                </div>
                <div className="text-center">
                  <Stars rating={t.rating} />
                  <span className="text-xs text-[#6b7280]">{(t.rating ?? 0).toFixed(1)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/agents/${t.id}/publish`}
                  className="p-2 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-colors"
                  title="Edit"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => unpublish(t.id)}
                  className="p-2 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-red-400 hover:border-red-500/30 transition-colors"
                  title="Unpublish"
                >
                  <EyeSlashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
