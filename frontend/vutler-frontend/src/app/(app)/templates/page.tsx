"use client";
import { useState } from "react";

const BMAD_TEMPLATES = [
  { name: "Analyst Agent", desc: "Deep analysis and research tasks", icon: "🔍" },
  { name: "PM Agent", desc: "Project management and coordination", icon: "📋" },
  { name: "Architect Agent", desc: "System design and architecture", icon: "🏗️" },
  { name: "Developer Agent", desc: "Code generation and review", icon: "💻" },
  { name: "Tester Agent", desc: "QA and testing automation", icon: "🧪" },
  { name: "DevOps Agent", desc: "CI/CD and infrastructure", icon: "⚙️" },
  { name: "Designer Agent", desc: "UI/UX design assistance", icon: "🎨" },
  { name: "Writer Agent", desc: "Technical writing and docs", icon: "✍️" },
  { name: "Reviewer Agent", desc: "Code and design reviews", icon: "👁️" },
  { name: "Planner Agent", desc: "Sprint and roadmap planning", icon: "🗺️" },
  { name: "Data Agent", desc: "Data analysis and pipelines", icon: "📊" },
  { name: "Security Agent", desc: "Security audits and compliance", icon: "🔒" },
  { name: "Support Agent", desc: "Customer support automation", icon: "🎧" },
  { name: "Onboarding Agent", desc: "New hire onboarding flows", icon: "🚀" },
  { name: "Scrum Master Agent", desc: "Agile ceremony facilitation", icon: "🏃" },
  { name: "Release Agent", desc: "Release management and notes", icon: "📦" },
  { name: "Monitor Agent", desc: "System monitoring and alerts", icon: "📡" },
  { name: "Doc Agent", desc: "Documentation generation", icon: "📄" },
  { name: "API Agent", desc: "API design and management", icon: "🔌" },
  { name: "Integration Agent", desc: "Third-party integrations", icon: "🔗" },
  { name: "Strategy Agent", desc: "Business strategy analysis", icon: "♟️" },
];

const BUSINESS_TEMPLATES = [
  { name: "Sales Outreach", desc: "Automated prospecting and follow-ups", icon: "📞" },
  { name: "Lead Qualifier", desc: "Score and qualify inbound leads", icon: "🎯" },
  { name: "Email Drafter", desc: "Professional email composition", icon: "📧" },
  { name: "Meeting Summarizer", desc: "Meeting notes and action items", icon: "📝" },
  { name: "Invoice Agent", desc: "Invoice creation and tracking", icon: "💰" },
  { name: "HR Assistant", desc: "HR policy Q&A and forms", icon: "👥" },
  { name: "Legal Reviewer", desc: "Contract review and analysis", icon: "⚖️" },
  { name: "Social Media Agent", desc: "Content creation and scheduling", icon: "📱" },
  { name: "SEO Agent", desc: "SEO analysis and optimization", icon: "🔎" },
  { name: "Translator Agent", desc: "Multi-language translation", icon: "🌍" },
  { name: "Report Generator", desc: "Business reports and dashboards", icon: "📈" },
  { name: "Scheduler Agent", desc: "Calendar and appointment management", icon: "📅" },
  { name: "Feedback Analyst", desc: "Customer feedback analysis", icon: "💬" },
  { name: "Compliance Agent", desc: "Regulatory compliance checks", icon: "✅" },
  { name: "Training Agent", desc: "Employee training and quizzes", icon: "🎓" },
  { name: "Proposal Writer", desc: "Business proposal drafting", icon: "📑" },
  { name: "Expense Tracker", desc: "Expense reporting and approval", icon: "🧾" },
  { name: "CRM Agent", desc: "Customer relationship management", icon: "🤝" },
  { name: "Knowledge Base", desc: "Internal wiki and FAQ bot", icon: "📚" },
  { name: "Workflow Agent", desc: "Business process automation", icon: "🔄" },
];

type Tab = "all" | "bmad" | "business";

export default function TemplatesPage() {
  const [tab, setTab] = useState<Tab>("all");

  const all = [
    ...BMAD_TEMPLATES.map((t) => ({ ...t, category: "BMAD" as const })),
    ...BUSINESS_TEMPLATES.map((t) => ({ ...t, category: "Business" as const })),
  ];

  const filtered = tab === "all" ? all : tab === "bmad" ? all.filter((t) => t.category === "BMAD") : all.filter((t) => t.category === "Business");

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Templates Gallery</h1>
      <p className="text-gray-400 mb-6">41 ready-to-use agent templates</p>

      <div className="flex gap-2 mb-8">
        {(["all", "bmad", "business"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-blue-500 text-white" : "bg-[#14151f] text-gray-400 hover:text-white"}`}
          >
            {t === "all" ? `All (${all.length})` : t === "bmad" ? `BMAD (${BMAD_TEMPLATES.length})` : `Business (${BUSINESS_TEMPLATES.length})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((t) => (
          <div key={t.name} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 flex flex-col hover:border-blue-500/30 transition">
            <div className="text-3xl mb-3">{t.icon}</div>
            <h3 className="font-semibold mb-1">{t.name}</h3>
            <p className="text-gray-500 text-sm flex-1">{t.desc}</p>
            <span className="text-xs text-gray-600 mt-2 mb-3">{t.category}</span>
            <a
              href={`/builder?template=${encodeURIComponent(t.name)}`}
              className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-center py-2 rounded-lg text-sm font-medium transition"
            >
              Use Template
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
