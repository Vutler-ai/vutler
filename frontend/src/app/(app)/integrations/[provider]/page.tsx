"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { 
  ArrowLeftIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  PlayIcon,
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon,
  TrashIcon 
} from '@heroicons/react/24/outline';

interface Integration {
  provider: string;
  connected: boolean;
  connected_at?: string;
  connected_by?: string;
  status?: string;
}

interface ActionLog {
  id: string;
  action: string;
  status: 'success' | 'error';
  timestamp: string;
  duration_ms?: number;
  error_message?: string;
}

interface ProviderInfo {
  provider: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  actions: Array<{
    name: string;
    description: string;
    parameters?: Array<{
      name: string;
      type: string;
      required?: boolean;
    }>;
  }>;
}

export default function IntegrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const provider = params?.provider as string;
  
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<{ [key: string]: any }>({});

  // Default provider configurations
  const defaultProviders: { [key: string]: ProviderInfo } = {
    slack: {
      provider: 'slack',
      name: 'Slack',
      description: 'Send messages, list channels, and manage your Slack workspace',
      icon: '💬',
      color: '#4A154B',
      actions: [
        {
          name: 'list_channels',
          description: 'List all channels in your Slack workspace'
        },
        {
          name: 'send_message',
          description: 'Send a message to a channel or user',
          parameters: [
            { name: 'channel', type: 'string', required: true },
            { name: 'text', type: 'string', required: true }
          ]
        },
        {
          name: 'get_user_info',
          description: 'Get information about your Slack user'
        }
      ]
    },
    google: {
      provider: 'google',
      name: 'Google',
      description: 'Access Gmail, Google Drive, and Google Calendar',
      icon: '📧',
      color: '#4285F4',
      actions: [
        {
          name: 'list_emails',
          description: 'List recent emails from Gmail'
        },
        {
          name: 'send_email',
          description: 'Send an email via Gmail',
          parameters: [
            { name: 'to', type: 'string', required: true },
            { name: 'subject', type: 'string', required: true },
            { name: 'body', type: 'string', required: true }
          ]
        },
        {
          name: 'list_files',
          description: 'List files in Google Drive'
        }
      ]
    },
    github: {
      provider: 'github',
      name: 'GitHub',
      description: 'Manage repositories, issues, and pull requests',
      icon: '🐙',
      color: '#333333',
      actions: [
        {
          name: 'list_repos',
          description: 'List your GitHub repositories'
        },
        {
          name: 'create_issue',
          description: 'Create an issue in a repository',
          parameters: [
            { name: 'repo', type: 'string', required: true },
            { name: 'title', type: 'string', required: true },
            { name: 'body', type: 'string' }
          ]
        },
        {
          name: 'list_commits',
          description: 'List recent commits in a repository',
          parameters: [
            { name: 'repo', type: 'string', required: true }
          ]
        }
      ]
    }
  };

  useEffect(() => {
    if (provider) {
      fetchIntegrationData();
    }
  }, [provider]);

  const fetchIntegrationData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusRes, logsRes] = await Promise.all([
        authFetch(`/api/v1/integrations/${provider}/status`),
        authFetch(`/api/v1/integrations/${provider}/logs`).catch(() => null)
      ]);

      if (!statusRes.ok) {
        throw new Error(`Failed to fetch ${provider} integration status`);
      }

      const statusData = await statusRes.json();
      setIntegration(statusData);

      if (logsRes?.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }

      // Set provider info
      setProviderInfo(defaultProviders[provider] || {
        provider,
        name: provider.charAt(0).toUpperCase() + provider.slice(1),
        description: `${provider} integration`,
        icon: '🔗',
        color: '#6B7280',
        actions: []
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch integration data');
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (actionName: string, parameters: any = {}) => {
    try {
      setExecuting(actionName);
      setError(null);

      const response = await authFetch(`/api/v1/integrations/${provider}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionName,
          parameters
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `Failed to execute ${actionName}`);
      }

      // Store result for display
      setActionResults(prev => ({
        ...prev,
        [actionName]: result
      }));

      // Refresh logs
      await fetchIntegrationData();

    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to execute ${actionName}`);
    } finally {
      setExecuting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${providerInfo?.name}?`)) {
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

      // Redirect back to integrations page
      router.push('/integrations');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${provider}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!integration || !providerInfo) {
    return (
      <div className="text-center py-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Integration not found</h2>
        <p className="text-[#9ca3af] mb-4">
          The integration you're looking for doesn't exist or isn't connected.
        </p>
        <Link
          href="/integrations"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Integrations
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/integrations"
          className="p-2 hover:bg-[#14151f] rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5 text-[#9ca3af]" />
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-bold text-white"
            style={{ backgroundColor: providerInfo.color }}
          >
            {providerInfo.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{providerInfo.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {integration.connected ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/20 text-green-400 text-sm font-medium rounded-full">
                  <CheckCircleIcon className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-900/20 text-red-400 text-sm font-medium rounded-full">
                  <XCircleIcon className="w-4 h-4" />
                  Disconnected
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
          Disconnect
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Info */}
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Connection Details</h2>
          <div className="space-y-3">
            {integration.connected_at && (
              <div className="flex items-center gap-2 text-sm">
                <ClockIcon className="w-4 h-4 text-[#6b7280]" />
                <span className="text-[#9ca3af]">Connected:</span>
                <span className="text-white">{new Date(integration.connected_at).toLocaleString()}</span>
              </div>
            )}
            {integration.connected_by && (
              <div className="flex items-center gap-2 text-sm">
                <UserIcon className="w-4 h-4 text-[#6b7280]" />
                <span className="text-[#9ca3af]">Connected by:</span>
                <span className="text-white">{integration.connected_by}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#9ca3af]">Status:</span>
              <span className="text-white">{integration.status || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Actions Panel */}
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {providerInfo.actions.slice(0, 3).map((action) => (
              <button
                key={action.name}
                onClick={() => executeAction(action.name)}
                disabled={!integration.connected || executing === action.name}
                className="w-full flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors text-left"
              >
                <PlayIcon className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div>{executing === action.name ? 'Executing...' : action.name}</div>
                  <div className="text-xs text-blue-200">{action.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Results */}
      {Object.keys(actionResults).length > 0 && (
        <div className="mt-6 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
          <div className="space-y-4">
            {Object.entries(actionResults).map(([actionName, result]) => (
              <div key={actionName} className="border border-[rgba(255,255,255,0.07)] rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-400 mb-2">{actionName}</h3>
                <pre className="bg-[#0a0b14] p-3 rounded text-xs text-white overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Logs */}
      <div className="mt-6 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Activity Logs</h2>
        {logs.length === 0 ? (
          <p className="text-[#9ca3af] text-center py-8">No activity logs available</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-4 p-3 border border-[rgba(255,255,255,0.05)] rounded-lg"
              >
                <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium">{log.action}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      log.status === 'success' 
                        ? 'bg-green-900/20 text-green-400' 
                        : 'bg-red-900/20 text-red-400'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  {log.error_message && (
                    <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
                  )}
                </div>
                <div className="text-xs text-[#6b7280] flex flex-col items-end">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {log.duration_ms && (
                    <span>{log.duration_ms}ms</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
