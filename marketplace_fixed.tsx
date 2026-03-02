"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { 
  ShoppingBagIcon, 
  MagnifyingGlassIcon, 
  FireIcon,
  TrophyIcon,
  ClockIcon,
  RocketLaunchIcon,
  StarIcon,
  UserCircleIcon
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

interface MarketplaceTemplate {
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

const MARKETPLACE_CATEGORIES = [
  "All", "Featured", "Engineering", "Support", "Marketing", "Sales", 
  "Legal", "HR", "Finance", "Operations", "Creative"
];

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authFetch("/api/v1/templates");
      
      if (!response.ok) {
        throw new Error("Failed to fetch templates");
      }
      
      const data = await response.json();
      let marketplaceTemplates = data.templates || [];
      
      setTemplates(marketplaceTemplates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch marketplace templates");
    } finally {
      setLoading(false);
    }
  };

  const deployTemplate = async (template: MarketplaceTemplate) => {
    try {
      setError(null);
      
      const agentData = {
        name: template.name,
        username: template.name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        email: `${template.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}@vutler.com`,
        role: template.name,
        description: template.description,
        model: template.config.model,
        provider: "anthropic", // Default provider
        temperature: template.config.temperature.toString(),
        max_tokens: 4096,
        system_prompt: template.config.system_prompt,
        capabilities: template.config.tags || []
      };
      
      const response = await authFetch("/api/v1/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData)
      });
      
      if (!response.ok) throw new Error("Failed to deploy agent from template");
      
      alert(`Agent "${template.name}" deployed successfully!`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deploy agent from template");
    }
  };

  const filteredTemplates = templates.filter(template => {
    let matchesCategory = true;
    
    switch (selectedCategory) {
      case "Featured":
        // Show first 6 templates as "featured"
        matchesCategory = templates.indexOf(template) < 6;
        break;
      case "All":
        matchesCategory = true;
        break;
      default:
        matchesCategory = template.category === selectedCategory.toLowerCase();
    }
    
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (template.config.tags && template.config.tags.some(tag => 
                           tag.toLowerCase().includes(searchQuery.toLowerCase())
                         ));
    
    return matchesCategory && matchesSearch;
  });

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    switch (sortBy) {
      case "popular":
        return (b.downloads || 0) - (a.downloads || 0);
      case "newest":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "alphabetical":
        return a.name.localeCompare(b.name);
      case "category":
        return a.category.localeCompare(b.category);
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Featured": return TrophyIcon;
      case "Engineering": return "⚙️";
      case "Support": return "🎧";
      case "Marketing": return "📈";
      case "Sales": return "🎯";
      case "Legal": return "⚖️";
      case "HR": return "👥";
      case "Finance": return "💰";
      case "Operations": return "📊";
      case "Creative": return "🎨";
      default: return ShoppingBagIcon;
    }
  };

  const getTemplateIcon = (template: MarketplaceTemplate) => {
    if (template.config.icon) {
      return template.config.icon;
    }
    // Default icons based on category
    const categoryIcons = {
      engineering: "⚙️",
      support: "🎧",
      marketing: "📈",
      sales: "🎯",
      legal: "⚖️",
      hr: "👥",
      finance: "💰",
      operations: "📊",
      creative: "🎨"
    };
    return categoryIcons[template.category as keyof typeof categoryIcons] || "🤖";
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Marketplace</h1>
          <p className="text-sm text-[#9ca3af]">
            Deploy pre-built AI agent templates instantly - All FREE!
          </p>
        </div>
        <button
          onClick={fetchTemplates}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <ShoppingBagIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="category">By Category</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {MARKETPLACE_CATEGORIES.map((category) => {
            const Icon = getCategoryIcon(category);
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? "bg-blue-600 text-white"
                    : "bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-gray-300 hover:text-white"
                }`}
              >
                {typeof Icon === "string" ? (
                  <span className="text-lg">{Icon}</span>
                ) : category === "Featured" ? (
                  <Icon className="w-4 h-4" />
                ) : null}
                {category}
              </button>
            );
          })}
        </div>
      </div>

      {sortedTemplates.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <ShoppingBagIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">
            {templates.length === 0 ? "Loading Templates..." : "No Templates Found"}
          </h2>
          <p className="text-[#9ca3af] max-w-md mx-auto">
            {templates.length === 0 
              ? "Loading available agent templates..."
              : `No templates match your current filters. Try adjusting your search or category.`
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 hover:border-[rgba(255,255,255,0.1)] transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{getTemplateIcon(template)}</span>
                    <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                    {templates.indexOf(template) < 6 && (
                      <TrophyIcon className="w-5 h-5 text-yellow-400" title="Featured" />
                    )}
                  </div>
                  <p className="text-sm text-[#9ca3af] line-clamp-2">{template.description}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-green-400">
                    FREE
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Category:</span>
                  <span className="text-white capitalize">{template.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Model:</span>
                  <span className="text-white font-mono text-xs">{template.config.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Temperature:</span>
                  <span className="text-white">{template.config.temperature}</span>
                </div>
              </div>

              {template.config.tags && template.config.tags.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-1">
                    {template.config.tags.slice(0, 3).map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                    {template.config.tags.length > 3 && (
                      <span className="px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs">
                        +{template.config.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4 text-sm">
                <div className="text-[#9ca3af]">
                  {template.downloads ? `${template.downloads.toLocaleString()} uses` : "New template"}
                </div>
                <div className="text-[#9ca3af]">
                  {new Date(template.created_at).toLocaleDateString()}
                </div>
              </div>

              <button
                onClick={() => deployTemplate(template)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <RocketLaunchIcon className="w-4 h-4" />
                Deploy Agent
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}