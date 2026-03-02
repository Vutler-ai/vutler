"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { 
  RectangleStackIcon, 
  DocumentDuplicateIcon,
  RocketLaunchIcon
} from "@heroicons/react/24/outline";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  downloads?: number;
  created_at: string;
  updated_at: string;
  config: {
    icon?: string;
    tags?: string[];
    model: string;
    temperature: number;
    system_prompt: string;
  };
}

const TEMPLATE_CATEGORIES = [
  "All", "Engineering", "Support", "Marketing", "Sales",
  "Legal", "HR", "Finance", "Operations", "Creative"
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => { fetchTemplates(); }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch("/api/v1/templates");
      if (!response.ok) throw new Error("Failed to fetch templates");
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  };

  const installTemplate = async (template: Template) => {
    try {
      setInstalling(template.id);
      setError(null);

      const response = await authFetch("/api/v1/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to install template");
      }

      const data = await response.json();
      setToast({ message: `✅ Agent "${template.name}" installed successfully!`, type: 'success' });

      // Optional: redirect to agents after 2s
      setTimeout(() => {
        if (confirm(`Agent "${template.name}" has been deployed. Go to Agents page?`)) {
          window.location.href = '/agents';
        }
      }, 500);
    } catch (err) {
      setToast({ message: `❌ ${err instanceof Error ? err.message : "Install failed"}`, type: 'error' });
    } finally {
      setInstalling(null);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === "All" || template.category === selectedCategory.toLowerCase();
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (template.config.tags && template.config.tags.some(tag => 
                           tag.toLowerCase().includes(searchQuery.toLowerCase())
                         ));
    return matchesCategory && matchesSearch;
  });

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  const getTemplateIcon = (template: Template) => {
    if (template.config.icon) return template.config.icon;
    const categoryIcons: Record<string, string> = {
      engineering: "⚙️", support: "🎧", marketing: "📈", sales: "🎯",
      legal: "⚖️", hr: "👥", finance: "💰", operations: "📊", creative: "🎨"
    };
    return categoryIcons[template.category] || "🤖";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-in ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Templates</h1>
          <p className="text-sm text-[#9ca3af]">
            Pre-built agent configurations — Install with 1 click!
          </p>
        </div>
        <button
          onClick={fetchTemplates}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RectangleStackIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? "bg-blue-600 text-white"
                  : "bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-gray-300 hover:text-white"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <RectangleStackIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">
            {templates.length === 0 ? "No Templates Available" : "No Templates Found"}
          </h2>
          <p className="text-[#9ca3af] max-w-md mx-auto">
            {templates.length === 0 
              ? "Template library is empty. Check back soon."
              : "No templates match your filters."
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 hover:border-[rgba(255,255,255,0.1)] transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{getTemplateIcon(template)}</span>
                    <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                  </div>
                  <p className="text-sm text-[#9ca3af] line-clamp-2">{template.description}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-green-400">FREE</div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280]">Category:</span>
                  <span className="text-white capitalize">{template.category}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280]">Model:</span>
                  <span className="text-white font-mono text-xs">{template.config.model}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280]">Temperature:</span>
                  <span className="text-white">{template.config.temperature}</span>
                </div>
              </div>

              {template.config.tags && template.config.tags.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-1">
                    {template.config.tags.slice(0, 3).map((tag, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">#{tag}</span>
                    ))}
                    {template.config.tags.length > 3 && (
                      <span className="px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">+{template.config.tags.length - 3}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4 text-sm">
                <div className="text-[#9ca3af]">
                  {template.downloads ? `${template.downloads.toLocaleString()} installs` : "New template"}
                </div>
                <div className="text-[#9ca3af]">{formatDate(template.created_at)}</div>
              </div>

              {/* Actions — Install button (Story 4.2) */}
              <div className="flex gap-2">
                <button
                  onClick={() => installTemplate(template)}
                  disabled={installing === template.id}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {installing === template.id ? (
                    <>
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <RocketLaunchIcon className="w-4 h-4" />
                      Install
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(template.config, null, 2));
                    setToast({ message: "📋 Config copied to clipboard!", type: 'success' });
                  }}
                  className="px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.1)] text-gray-400 hover:text-white rounded-lg transition-colors"
                  title="Copy config"
                >
                  <DocumentDuplicateIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.07)]">
                <p className="text-xs text-[#6b7280] line-clamp-2">
                  <span className="font-medium">Prompt:</span> {template.config.system_prompt}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
