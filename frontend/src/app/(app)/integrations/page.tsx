"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';
import { MagnifyingGlassIcon, CheckBadgeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Integration {
  provider: string;
  connected: boolean;
  connected_at?: string;
  connected_by?: string;
  status?: string;
}

interface AvailableProvider {
  provider: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  actions?: string[];
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  // Default available providers
  const defaultProviders: AvailableProvider[] = [
    {
      provider: 'slack',
      name: 'Slack',
      description: 'Send messages, list channels, and manage your Slack workspace',
      icon: '💬',
      color: '#4A154B',
      actions: ['send_message', 'list_channels', 'get_user_info']
    },
    {
      provider: 'google',
      name: 'Google',
      description: 'Access Gmail, Google Drive, and Google Calendar',
      icon: '📧',
      color: '#4285F4',
      actions: ['send_email', 'list_files', 'create_event']
    },
    {
      provider: 'github',
      name: 'GitHub',
      description: 'Manage repositories, issues, and pull requests',
      icon: '🐙',
      color: '#333333',
      actions: ['list_repos', 'create_issue', 'list_commits']
    }
  ];

  useEffect(() => {
    fetchIntegrationsData();
  }, []);

  const fetchIntegrationsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [integrationsRes, availableRes] = await Promise.all([
        authFetch('/api/v1/integrations'),
        authFetch('/api/v1/integrations/available').catch(() => null) // Fallback if endpoint doesn't exist
      ]);

      if (!integrationsRes.ok) {
        throw new Error('Failed to fetch integrations');
      }

      const integrationsData = await integrationsRes.json();
      setIntegrations(integrationsData.integrations || []);

      if (availableRes?.ok) {
        const availableData = await availableRes.json();
        setAvailableProviders(availableData.providers || defaultProviders);
      } else {
        setAvailableProviders(defaultProviders);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setAvailableProviders(defaultProviders); // Use defaults on error
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    try {
      setConnecting(provider);
      setError(null);

      const response = await authFetch(`/api/v1/integrations/${provider}/connect`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to ${provider}`);
      }

      const { authUrl } = await response.json();
      
      if (authUrl) {
        // Redirect to OAuth flow
        window.location.href = authUrl;
      } else {
        throw new Error('No auth URL received');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect to ${provider}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) {
      return;
    }

    try {
      setError(null);

      const response = await authFetch(`/api/v1/integrations/${provider}/disconnect`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to disconnect ${provider}`);
      }

      // Refresh data
      await fetchIntegrationsData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${provider}`);
    }
  };

  const getProviderInfo = (provider: string) => {
    return availableProviders.find(p => p.provider === provider) || {
      provider,
      name: provider.charAt(0).toUpperCase() + provider.slice(1),
      description: `${provider} integration`,
      icon: '🔗',
      color: '#6B7280'
    };
  };

  const isConnected = (provider: string) => {
    return integrations.find(i => i.provider === provider)?.connected || false;
  };

  const filteredProviders = availableProviders.filter(provider =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedIntegrations = integrations.filter(i => i.connected);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Connect Your Tools</h1>
        <p className="text-lg text-[#9ca3af]">
          Integrate with your favorite services to supercharge your workflow
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#6b7280]" />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Connected Integrations */}
      {connectedIntegrations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <CheckBadgeIcon className="w-6 h-6 text-green-500" />
            Connected Integrations ({connectedIntegrations.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedIntegrations.map((integration) => {
              const providerInfo = getProviderInfo(integration.provider);
              return (
                <Link
                  key={integration.provider}
                  href={`/integrations/${integration.provider}`}
                  className="block bg-[#14151f] border border-green-500/20 rounded-xl p-6 hover:border-green-500/40 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
                        style={{ backgroundColor: providerInfo.color }}
                      >
                        {providerInfo.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                          {providerInfo.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/20 text-green-400 text-xs font-medium rounded-full">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Connected
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-[#9ca3af] mb-4">
                    {providerInfo.description}
                  </p>
                  {integration.connected_at && (
                    <p className="text-xs text-[#6b7280]">
                      Connected {new Date(integration.connected_at).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Available Integrations ({filteredProviders.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProviders.map((provider) => {
            const connected = isConnected(provider.provider);
            const isConnecting = connecting === provider.provider;
            
            return (
              <div
                key={provider.provider}
                className={`bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 hover:border-[rgba(255,255,255,0.15)] transition-all duration-200 ${connected ? 'border-green-500/20' : ''}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
                      style={{ backgroundColor: provider.color }}
                    >
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {provider.name}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                        connected 
                          ? 'bg-green-900/20 text-green-400' 
                          : 'bg-gray-900/20 text-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                        {connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-[#9ca3af] mb-4">
                  {provider.description}
                </p>
                
                <div className="flex gap-2">
                  {connected ? (
                    <>
                      <Link
                        href={`/integrations/${provider.provider}`}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg text-center transition-colors"
                      >
                        Manage
                      </Link>
                      <button
                        onClick={() => handleDisconnect(provider.provider)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(provider.provider)}
                      disabled={isConnecting}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredProviders.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <MagnifyingGlassIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No integrations found</h3>
            <p className="text-[#9ca3af]">
              Try adjusting your search query to find the integration you're looking for.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
