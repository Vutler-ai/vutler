"use client";
import { useState } from "react";

const CATEGORIES = ["All", "Productivity", "Sales", "Support", "Engineering", "Content", "Legal"] as const;
type Category = (typeof CATEGORIES)[number];

interface MarketItem {
  name: string;
  desc: string;
  icon: string;
  category: Exclude<Category, "All">;
  author: string;
  installs: string;
}

const ITEMS: MarketItem[] = [
  { name: "Smart Scheduler", desc: "AI-powered calendar management", icon: "📅", category: "Productivity", author: "Vutler", installs: "2.1k" },
  { name: "Email Composer Pro", desc: "Context-aware email drafting", icon: "📧", category: "Productivity", author: "Vutler", installs: "3.4k" },
  { name: "Task Automator", desc: "Automate repetitive workflows", icon: "⚡", category: "Productivity", author: "Community", installs: "1.8k" },
  { name: "Note Taker", desc: "Meeting notes with action items", icon: "📝", category: "Productivity", author: "Vutler", installs: "4.2k" },
  { name: "Focus Timer", desc: "Pomodoro with AI task suggestions", icon: "⏱️", category: "Productivity", author: "Community", installs: "900" },
  { name: "Sales Outreach Bot", desc: "Personalized cold outreach at scale", icon: "📞", category: "Sales", author: "Vutler", installs: "5.1k" },
  { name: "Lead Scorer", desc: "ML-based lead qualification", icon: "🎯", category: "Sales", author: "Vutler", installs: "2.8k" },
  { name: "Deal Tracker", desc: "Pipeline management assistant", icon: "💼", category: "Sales", author: "Community", installs: "1.5k" },
  { name: "Proposal Generator", desc: "Auto-generate sales proposals", icon: "📑", category: "Sales", author: "Vutler", installs: "1.9k" },
  { name: "CRM Sync Agent", desc: "Keep your CRM always up to date", icon: "🔄", category: "Sales", author: "Community", installs: "2.3k" },
  { name: "Ticket Resolver", desc: "Auto-resolve common support tickets", icon: "🎫", category: "Support", author: "Vutler", installs: "6.7k" },
  { name: "FAQ Bot", desc: "Instant answers from your knowledge base", icon: "❓", category: "Support", author: "Vutler", installs: "8.2k" },
  { name: "Sentiment Analyzer", desc: "Real-time customer sentiment", icon: "😊", category: "Support", author: "Community", installs: "1.2k" },
  { name: "Escalation Agent", desc: "Smart ticket routing and escalation", icon: "🚨", category: "Support", author: "Vutler", installs: "3.1k" },
  { name: "Code Reviewer", desc: "Automated PR reviews with suggestions", icon: "👁️", category: "Engineering", author: "Vutler", installs: "7.3k" },
  { name: "Bug Triager", desc: "Auto-classify and prioritize bugs", icon: "🐛", category: "Engineering", author: "Community", installs: "2.4k" },
  { name: "Doc Generator", desc: "Auto-generate API documentation", icon: "📄", category: "Engineering", author: "Vutler", installs: "4.6k" },
  { name: "Test Writer", desc: "Generate unit and integration tests", icon: "🧪", category: "Engineering", author: "Vutler", installs: "3.8k" },
  { name: "Infra Monitor", desc: "Infrastructure health monitoring", icon: "📡", category: "Engineering", author: "Community", installs: "1.7k" },
  { name: "Blog Writer", desc: "SEO-optimized blog post generation", icon: "✍️", category: "Content", author: "Vutler", installs: "5.5k" },
  { name: "Social Media Manager", desc: "Multi-platform content scheduling", icon: "📱", category: "Content", author: "Vutler", installs: "4.1k" },
  { name: "Image Describer", desc: "Alt text and image descriptions", icon: "🖼️", category: "Content", author: "Community", installs: "1.3k" },
  { name: "Newsletter Agent", desc: "Curate and draft newsletters", icon: "📰", category: "Content", author: "Vutler", installs: "2.6k" },
  { name: "SEO Optimizer", desc: "Content optimization for search", icon: "🔎", category: "Content", author: "Community", installs: "3.2k" },
  { name: "Contract Reviewer", desc: "AI-powered contract analysis", icon: "⚖️", category: "Legal", author: "Vutler", installs: "3.9k" },
  { name: "Compliance Checker", desc: "Regulatory compliance automation", icon: "✅", category: "Legal", author: "Vutler", installs: "2.7k" },
  { name: "NDA Generator", desc: "Generate NDAs from templates", icon: "🔒", category: "Legal", author: "Community", installs: "1.6k" },
  { name: "Policy Tracker", desc: "Track policy changes and updates", icon: "📋", category: "Legal", author: "Community", installs: "800" },
];

export default function MarketplacePage() {
  const [cat, setCat] = useState<Category>("All");
  const [search, setSearch] = useState("");

  const filtered = ITEMS.filter((i) => {
    if (cat !== "All" && i.category !== cat) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Marketplace</h1>
      <p className="text-gray-400 mb-6">Discover and install agent extensions</p>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          className="flex-1 bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          placeholder="Search marketplace…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-2 mb-8 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${cat === c ? "bg-blue-500 text-white" : "bg-[#14151f] text-gray-400 hover:text-white"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <p className="text-gray-400">No results found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div key={item.name} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 flex flex-col hover:border-blue-500/30 transition">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{item.icon}</span>
                <span className="text-xs text-gray-600 bg-[#1a1b2e] px-2 py-1 rounded">{item.category}</span>
              </div>
              <h3 className="font-semibold mb-1">{item.name}</h3>
              <p className="text-gray-500 text-sm flex-1">{item.desc}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                <span className="text-xs text-gray-500">{item.author} · {item.installs} installs</span>
                <button className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1 rounded text-xs font-medium transition">
                  Install
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
