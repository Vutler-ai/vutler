"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { ChartBarIcon, CpuChipIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";

interface UsageData {
  success: boolean;
  data: any[];
  total_tokens: number;
}

interface Agent {
  id: string;
  name: string;
  provider: string;
  model: string;
  avatar: string;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [usageRes, agentsRes] = await Promise.all([
        authFetch("/api/v1/usage"),
        authFetch("/api/v1/agents")
      ]);
      
      if (!usageRes.ok || !agentsRes.ok) {
        throw new Error("Failed to fetch data");
      }
      
      const [usageData, agentsData] = await Promise.all([
        usageRes.json(),
        agentsRes.json()
      ]);
      
      setUsage(usageData);
      setAgents(agentsData.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch usage data");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "openai": return "from-green-500 to-green-600";
      case "anthropic": return "from-blue-500 to-blue-600";
      default: return "from-gray-500 to-gray-600";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const hasUsageData = usage && usage.data && usage.data.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usage Analytics</h1>
          <p className="text-sm text-[#9ca3af]">
            Monitor token consumption and API usage across your agents
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <ChartBarIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <CpuChipIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wide">
                Total Tokens
              </h3>
              <p className="text-2xl font-bold text-white">
                {formatNumber(usage?.total_tokens || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wide">
                Active Agents
              </h3>
              <p className="text-2xl font-bold text-white">
                {agents.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
              <CalendarDaysIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wide">
                Usage Period
              </h3>
              <p className="text-2xl font-bold text-white">
                All Time
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Details */}
      {hasUsageData ? (
        <div className="space-y-6">
          {/* Usage Chart or Table would go here */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Usage Breakdown</h2>
            <div className="space-y-4">
              {usage.data.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-[#1f2028] border border-[rgba(255,255,255,0.05)] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                      {item.agent?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.agent || "Unknown"}
                      </p>
                      <p className="text-xs text-[#9ca3af]">
                        {item.model || "Unknown Model"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">
                      {formatNumber(item.tokens || 0)} tokens
                    </p>
                    <p className="text-xs text-[#9ca3af]">
                      {item.requests || 0} requests
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* No Usage Data */
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <ChartBarIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Usage Data</h2>
          <p className="text-[#9ca3af] max-w-md mx-auto mb-6">
            Start using your agents to see token consumption and usage analytics here.
          </p>
          
          {/* Show Current Agents */}
          {agents.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-white mb-4">
                Ready to Track Usage ({agents.length} agents)
              </h3>
              <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                {agents.slice(0, 8).map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.05)] rounded-lg"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden">
                      <img 
                        src={agent.avatar} 
                        alt={agent.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23374151"/><text x="50" y="50" text-anchor="middle" dy="0.3em" fill="white" font-size="40">${agent.name.charAt(0)}</text></svg>`;
                        }}
                      />
                    </div>
                    <span className="text-sm text-white">{agent.name}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getProviderColor(agent.provider)} text-white`}>
                      {agent.provider}
                    </span>
                  </div>
                ))}
                {agents.length > 8 && (
                  <div className="flex items-center justify-center w-12 h-10 bg-[#1f2028] border border-[rgba(255,255,255,0.05)] rounded-lg">
                    <span className="text-sm text-[#9ca3af]">+{agents.length - 8}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
