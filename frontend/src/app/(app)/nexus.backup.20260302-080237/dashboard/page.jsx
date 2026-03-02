'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Activity, Clock, Cpu, AlertCircle } from 'lucide-react';

export default function NexusDashboardPage() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInstances = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v1/nexus/instances');
      if (!response.ok) throw new Error('Failed to load instances');
      
      const data = await response.json();
      setInstances(data.instances || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    // Poll every 10 seconds
    const interval = setInterval(fetchInstances, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (lastHeartbeat) => {
    if (!lastHeartbeat) return 'text-gray-500';
    
    const lastTime = new Date(lastHeartbeat);
    const now = new Date();
    const diffMinutes = (now - lastTime) / (1000 * 60);
    
    if (diffMinutes < 5) return 'text-green-600';
    if (diffMinutes < 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusLabel = (lastHeartbeat) => {
    if (!lastHeartbeat) return 'Never';
    
    const lastTime = new Date(lastHeartbeat);
    const now = new Date();
    const diffSeconds = (now - lastTime) / 1000;
    
    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">🚀 Nexus Dashboard</h1>
          <p className="text-gray-600">Monitor your registered Nexus instances</p>
        </div>
        <button
          onClick={fetchInstances}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center gap-2"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6 flex items-start gap-2">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && instances.length === 0 ? (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={32} />
          <p className="text-gray-600">Loading instances...</p>
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <Cpu size={40} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No instances yet</h3>
          <p className="text-gray-600 mb-4">Get started by generating a token and running vutler-nexus</p>
          <a
            href="/nexus/setup"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Generate Token →
          </a>
        </div>
      ) : (
        <div className="grid gap-4">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{instance.name}</h3>
                    <div className={`flex items-center gap-1 ${getStatusColor(instance.last_heartbeat)}`}>
                      <Activity size={16} />
                      <span className="text-sm font-medium">
                        {instance.last_heartbeat 
                          ? (new Date(instance.last_heartbeat).getTime() > new Date().getTime() - 5 * 60 * 1000 ? 'Online' : 'Offline')
                          : 'Offline'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Machine ID:</span>
                      <p className="text-xs font-mono break-all">{instance.machine_id}</p>
                    </div>
                    <div>
                      <span className="font-medium">Version:</span>
                      <p>{instance.version || 'unknown'}</p>
                    </div>
                    <div>
                      <span className="font-medium flex items-center gap-1">
                        <Clock size={14} />
                        Last Heartbeat:
                      </span>
                      <p className={getStatusColor(instance.last_heartbeat)}>
                        {getStatusLabel(instance.last_heartbeat)}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mt-3">
                    Created {new Date(instance.created_at).toLocaleDateString()} at {new Date(instance.created_at).toLocaleTimeString()}
                  </div>
                </div>

                <div className="ml-4 pt-1">
                  <div className={`w-3 h-3 rounded-full ${
                    instance.last_heartbeat && new Date(instance.last_heartbeat).getTime() > new Date().getTime() - 5 * 60 * 1000
                      ? 'bg-green-500'
                      : 'bg-gray-400'
                  }`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Tip:</strong> Instances send heartbeats every 60 seconds. If your instance shows as offline, check that it's still running with <code className="bg-blue-100 px-1 rounded">vutler-nexus status</code>
        </p>
      </div>
    </div>
  );
}
