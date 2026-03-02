"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  StarIcon as StarOutline,
  ChatBubbleLeftIcon,
  CpuChipIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

interface Template {
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
    tools?: string[];
  };
}

interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  created_at: string;
}

function Stars({ rating = 0, size = "sm" }: { rating?: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "w-6 h-6" : size === "md" ? "w-5 h-5" : "w-4 h-4";
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

function StarDistribution({ reviews }: { reviews: Review[] }) {
  const counts = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => Math.round(r.rating) === s).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <div className="space-y-2">
      {counts.map(({ star, count }) => (
        <div key={star} className="flex items-center gap-2 text-sm">
          <span className="text-[#9ca3af] w-4">{star}</span>
          <StarSolid className="w-3.5 h-3.5 text-yellow-400" />
          <div className="flex-1 h-2 bg-[#1e293b] rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400 rounded-full"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="text-[#6b7280] w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

// Mock reviews for demo
const MOCK_REVIEWS: Review[] = [
  { id: "r1", author: "Sarah K.", rating: 5, comment: "Excellent template! Saved me hours of setup time. The system prompt is well-crafted and the model choice is perfect for this use case.", created_at: "2026-02-15T10:00:00Z" },
  { id: "r2", author: "Mike D.", rating: 4, comment: "Great starting point. I tweaked the temperature a bit but otherwise it was ready to go.", created_at: "2026-02-10T14:30:00Z" },
  { id: "r3", author: "Lisa M.", rating: 5, comment: "This is exactly what I needed for my team. Highly recommended!", created_at: "2026-01-28T09:15:00Z" },
  { id: "r4", author: "James R.", rating: 3, comment: "Decent template but could use more tool integrations. The base is solid though.", created_at: "2026-01-20T16:45:00Z" },
];

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [similar, setSimilar] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviews] = useState<Review[]>(MOCK_REVIEWS);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Try marketplace endpoint first
        let res = await authFetch(`/api/v1/marketplace/templates/${id}`);
        if (!res.ok) {
          // Fallback: fetch all templates and find by id
          res = await authFetch("/api/v1/templates");
          if (!res.ok) throw new Error("Failed to fetch");
          const data = await res.json();
          const list = data.templates || [];
          const found = list.find((t: any) => t.id === id);
          if (!found) throw new Error("Template not found");
          setTemplate({
            ...found,
            rating: found.rating ?? 4.2,
            review_count: found.review_count ?? MOCK_REVIEWS.length,
            installs: found.downloads ?? 234,
            price: found.price ?? 0,
            author: found.author ?? "Vutler Team",
          });
          setSimilar(
            list
              .filter((t: any) => t.id !== id && t.category === found.category)
              .slice(0, 3)
              .map((t: any) => ({
                ...t,
                rating: t.rating ?? 3 + Math.random() * 2,
                installs: t.downloads ?? Math.floor(Math.random() * 500),
                price: t.price ?? 0,
              }))
          );
          return;
        }
        const data = await res.json();
        setTemplate(data.template || data);
        setSimilar(data.similar || []);
      } catch {
        setTemplate(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleInstall = async () => {
    if (!template) return;
    try {
      setInstalling(true);
      let res = await authFetch(`/api/v1/marketplace/templates/${id}/install`, { method: "POST" });
      if (!res.ok) {
        res = await authFetch("/api/v1/agents/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: id }),
        });
        if (!res.ok) throw new Error("Install failed");
      }
      alert("Agent installed to your workspace!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  };

  const submitReview = () => {
    alert(`Review submitted: ${reviewStars} stars`);
    setShowReviewForm(false);
    setReviewComment("");
  };

  const getIcon = (t: Template) => t.config?.icon || "🤖";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3b82f6]" />
      </div>
    );
  }

  if (!template) {
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1 text-sm text-[#9ca3af] hover:text-white mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Back to Marketplace
      </Link>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <span className="text-5xl">{getIcon(template)}</span>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white mb-1">{template.name}</h1>
                <p className="text-[#9ca3af] text-sm mb-3">
                  by <span className="text-white">{template.author || "Vutler Team"}</span>
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="px-2.5 py-1 bg-[#1e293b] text-[#60a5fa] rounded-md font-medium capitalize">
                    {template.category}
                  </span>
                  <div className="flex items-center gap-1">
                    <Stars rating={template.rating} size="md" />
                    <span className="text-white font-medium ml-1">
                      {(template.rating ?? 0).toFixed(1)}
                    </span>
                    <span className="text-[#6b7280]">
                      ({template.review_count ?? reviews.length} reviews)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[#9ca3af]">
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {(template.installs ?? 0).toLocaleString()} installs
                  </div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-3">
                <span className={`text-2xl font-bold ${(template.price ?? 0) > 0 ? "text-white" : "text-green-400"}`}>
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
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Description</h2>
            <div className="text-[#d1d5db] text-sm leading-relaxed whitespace-pre-wrap">
              {template.description}
            </div>
          </div>

          {/* Screenshots placeholder */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">Preview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-video bg-[#1e293b] rounded-lg flex items-center justify-center border border-[rgba(255,255,255,0.05)]"
                >
                  <PhotoIcon className="w-10 h-10 text-[#4b5563]" />
                </div>
              ))}
            </div>
          </div>

          {/* What's included */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">What&apos;s Included</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CpuChipIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">Model</p>
                  <p className="text-sm text-[#9ca3af] font-mono">{template.config.model}</p>
                </div>
              </div>
              {template.config.tools && template.config.tools.length > 0 && (
                <div className="flex items-start gap-3">
                  <WrenchScrewdriverIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Tools</p>
                    <p className="text-sm text-[#9ca3af]">{template.config.tools.join(", ")}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <DocumentTextIcon className="w-5 h-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">System Prompt Preview</p>
                  <p className="text-sm text-[#9ca3af] line-clamp-3 italic">
                    &ldquo;{template.config.system_prompt?.slice(0, 200)}
                    {(template.config.system_prompt?.length ?? 0) > 200 ? "…" : ""}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reviews */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">
                Reviews ({reviews.length})
              </h2>
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="px-4 py-1.5 border border-[#3b82f6] text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Write a Review
              </button>
            </div>

            {/* Star distribution */}
            <div className="mb-6 max-w-xs">
              <StarDistribution reviews={reviews} />
            </div>

            {/* Review form */}
            {showReviewForm && (
              <div className="mb-6 p-4 bg-[#1e293b] rounded-lg border border-[rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-[#9ca3af]">Your rating:</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} onClick={() => setReviewStars(s)} className="focus:outline-none">
                        {s <= reviewStars ? (
                          <StarSolid className="w-6 h-6 text-yellow-400" />
                        ) : (
                          <StarOutline className="w-6 h-6 text-[#4b5563] hover:text-yellow-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Write your review..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-sm resize-none"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => setShowReviewForm(false)}
                    className="px-3 py-1.5 text-sm text-[#9ca3af] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReview}
                    className="px-4 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Submit Review
                  </button>
                </div>
              </div>
            )}

            {/* Review list */}
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="pb-4 border-b border-[rgba(255,255,255,0.05)] last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{r.author}</span>
                    <Stars rating={r.rating} />
                    <span className="text-xs text-[#6b7280]">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[#d1d5db]">{r.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar — Similar Templates */}
        <div className="w-full lg:w-72 flex-shrink-0">
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
                    className="block p-3 rounded-lg hover:bg-[#1e293b] transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{getIcon(s)}</span>
                      <span className="text-sm font-medium text-white truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6b7280]">
                      <Stars rating={s.rating} />
                      <span>{(s.installs ?? 0).toLocaleString()} installs</span>
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
