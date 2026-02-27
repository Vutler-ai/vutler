'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// STYLES & CONSTANTS
// ============================================================================

const COLORS = {
  navy: '#1a1a2e',
  blue: '#0066ff',
  green: '#00cc66',
  red: '#ff3366',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  white: '#ffffff',
  darkGray: '#374151',
};

const STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
};

const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// ============================================================================
// SPARKLINE COMPONENT (SVG)
// ============================================================================

const Sparkline = ({ data, width = 80, height = 30, color = COLORS.blue }) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ============================================================================
// GAUGE COMPONENT
// ============================================================================

const Gauge = ({ value, label, color = COLORS.blue }) => {
  const percentage = Math.min(Math.max(value || 0, 0), 100);
  const getColor = () => {
    if (percentage > 90) return COLORS.red;
    if (percentage > 70) return '#ff9900';
    return color;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <span style={{ color: COLORS.gray }}>{label}</span>
        <span style={{ fontWeight: 600, color: COLORS.navy }}>{percentage.toFixed(1)}%</span>
      </div>
      <div style={{
        height: '6px',
        backgroundColor: COLORS.lightGray,
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: getColor(),
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
};

// ============================================================================
// BADGE COMPONENT
// ============================================================================

const Badge = ({ status, label }) => {
  const isOnline = status === STATUS.ONLINE;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      backgroundColor: isOnline ? '#d1fae5' : '#fee2e2',
      color: isOnline ? '#065f46' : '#991b1b',
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: isOnline ? COLORS.green : COLORS.red,
      }} />
      {label || (isOnline ? 'Online' : 'Offline')}
    </div>
  );
};

// ============================================================================
// AGENT CARD COMPONENT
// ============================================================================

const AgentCard = ({ agent, onClick }) => {
  return (
    <div
      onClick={() => onClick(agent)}
      style={{
        backgroundColor: COLORS.white,
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: `1px solid ${COLORS.lightGray}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,102,255,0.15)';
        e.currentTarget.style.borderColor = COLORS.blue;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        e.currentTarget.style.borderColor = COLORS.lightGray;
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: COLORS.navy }}>
            {agent.name}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: COLORS.gray }}>
            v{agent.version}
          </p>
        </div>
        <Badge status={agent.status} />
      </div>

      {/* Last Heartbeat */}
      <div style={{ marginBottom: '16px', fontSize: '13px', color: COLORS.gray }}>
        Last heartbeat: <span style={{ fontWeight: 500, color: COLORS.navy }}>{formatTimestamp(agent.lastHeartbeat)}</span>
      </div>

      {/* Gauges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Gauge value={agent.metrics?.cpu} label="CPU" color={COLORS.blue} />
        <Gauge value={agent.metrics?.memory} label="RAM" color={COLORS.blue} />
      </div>
    </div>
  );
};

// ============================================================================
// MONITORING OVERVIEW
// ============================================================================

const MonitoringOverview = ({ agents }) => {
  const online = agents.filter(a => a.status === STATUS.ONLINE).length;
  const offline = agents.length - online;
  const avgResponseTime = agents.reduce((sum, a) => sum + (a.metrics?.responseTime || 0), 0) / agents.length || 0;

  const StatCard = ({ label, value, color = COLORS.blue }) => (
    <div style={{
      flex: 1,
      backgroundColor: COLORS.white,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: `1px solid ${COLORS.lightGray}`,
    }}>
      <div style={{ fontSize: '14px', color: COLORS.gray, marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: 700, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
      <StatCard label="Total Agents" value={agents.length} color={COLORS.navy} />
      <StatCard label="Online" value={online} color={COLORS.green} />
      <StatCard label="Offline" value={offline} color={COLORS.red} />
      <StatCard label="Avg Response Time" value={`${avgResponseTime.toFixed(0)}ms`} color={COLORS.blue} />
    </div>
  );
};

// ============================================================================
// AGENT DETAIL MODAL
// ============================================================================

const AgentDetailModal = ({ agent, onClose, onConfigUpdate, onTaskAssign }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [config, setConfig] = useState(JSON.stringify(agent.config || {}, null, 2));
  const [logs, setLogs] = useState([]);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);

  // Fetch logs on mount and auto-refresh
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/v1/hybrid/${agent.id}/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };

    fetchLogs();
    if (autoRefreshLogs) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [agent.id, autoRefreshLogs]);

  const handleConfigSave = async () => {
    try {
      const parsedConfig = JSON.parse(config);
      const res = await fetch(`/api/v1/hybrid/${agent.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsedConfig }),
      });
      if (res.ok) {
        alert('Config updated successfully');
        onConfigUpdate?.();
      } else {
        alert('Failed to update config');
      }
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  };

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: 600,
        backgroundColor: activeTab === id ? COLORS.blue : 'transparent',
        color: activeTab === id ? COLORS.white : COLORS.gray,
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: COLORS.white,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: `1px solid ${COLORS.lightGray}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: COLORS.navy }}>
              {agent.name}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: COLORS.gray }}>
              ID: {agent.id} • v{agent.version}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: COLORS.lightGray,
              color: COLORS.navy,
              fontSize: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${COLORS.lightGray}`,
          display: 'flex',
          gap: '8px',
        }}>
          <Tab id="overview" label="Overview" />
          <Tab id="config" label="Config" />
          <Tab id="logs" label="Logs" />
          <Tab id="tasks" label="Task History" />
          <Tab id="metrics" label="Metrics" />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <Badge status={agent.status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: COLORS.gray, marginBottom: '4px' }}>Last Heartbeat</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: COLORS.navy }}>
                    {formatTimestamp(agent.lastHeartbeat)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: COLORS.gray, marginBottom: '4px' }}>Uptime</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: COLORS.navy }}>
                    {agent.uptime || 'N/A'}
                  </div>
                </div>
              </div>
              <Gauge value={agent.metrics?.cpu} label="CPU Usage" />
              <Gauge value={agent.metrics?.memory} label="Memory Usage" />
            </div>
          )}

          {activeTab === 'config' && (
            <div>
              <textarea
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                style={{
                  width: '100%',
                  height: '400px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  padding: '16px',
                  border: `1px solid ${COLORS.lightGray}`,
                  borderRadius: '8px',
                  resize: 'vertical',
                }}
              />
              <button
                onClick={handleConfigSave}
                style={{
                  marginTop: '16px',
                  padding: '12px 24px',
                  backgroundColor: COLORS.blue,
                  color: COLORS.white,
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save Config
              </button>
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Agent Logs</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={autoRefreshLogs}
                    onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                  />
                  Auto-refresh (5s)
                </label>
              </div>
              <div style={{
                backgroundColor: COLORS.navy,
                color: COLORS.white,
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '16px',
                borderRadius: '8px',
                maxHeight: '400px',
                overflow: 'auto',
              }}>
                {logs.length === 0 && <div>No logs available</div>}
                {logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <span style={{ color: COLORS.gray }}>[{new Date(log.timestamp).toISOString()}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Task History</h3>
              {(!agent.taskHistory || agent.taskHistory.length === 0) && (
                <div style={{ color: COLORS.gray }}>No tasks executed yet</div>
              )}
              {agent.taskHistory?.map((task) => (
                <div key={task.id} style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: COLORS.lightGray,
                  borderRadius: '8px',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{task.description}</div>
                  <div style={{ fontSize: '12px', color: COLORS.gray }}>
                    Status: {task.status} • {formatTimestamp(task.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>CPU & Memory Over Time</h3>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: COLORS.navy }}>CPU Usage</div>
                <Sparkline data={agent.metrics?.cpuHistory || []} width={800} height={80} color={COLORS.blue} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: COLORS.navy }}>Memory Usage</div>
                <Sparkline data={agent.metrics?.memoryHistory || []} width={800} height={80} color={COLORS.green} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DEPLOY NEW AGENT MODAL
// ============================================================================

const DeployAgentModal = ({ onClose }) => {
  const [tunnelToken, setTunnelToken] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateToken = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/v1/agents/hybrid/token', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTunnelToken(data.token);
      } else {
        alert('Failed to generate token');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const dockerCommand = tunnelToken
    ? `docker run -d --name vutler-agent \\
  -e VUTLER_TOKEN="${tunnelToken}" \\
  -e VUTLER_GATEWAY="wss://gateway.vutler.ch" \\
  vutler/agent:latest`
    : 'Generate a token first';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: COLORS.white,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '700px',
          padding: '32px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 700, color: COLORS.navy }}>
          Deploy New Agent
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Step 1: Generate Tunnel Token</h3>
          <button
            onClick={generateToken}
            disabled={generating}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.blue,
              color: COLORS.white,
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? 'Generating...' : 'Generate Token'}
          </button>
          {tunnelToken && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              backgroundColor: COLORS.lightGray,
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '13px',
              wordBreak: 'break-all',
            }}>
              {tunnelToken}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Step 2: Run Docker Command</h3>
          <div style={{
            backgroundColor: COLORS.navy,
            color: COLORS.white,
            fontFamily: 'monospace',
            fontSize: '13px',
            padding: '16px',
            borderRadius: '8px',
            position: 'relative',
          }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{dockerCommand}</pre>
            {tunnelToken && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(dockerCommand);
                  alert('Copied to clipboard!');
                }}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: COLORS.blue,
                  color: COLORS.white,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.lightGray,
              color: COLORS.navy,
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TASK ASSIGNMENT MODAL
// ============================================================================

const TaskAssignmentModal = ({ agents, onClose, onSubmit }) => {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(PRIORITY.MEDIUM);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedAgent || !description) {
      alert('Please select an agent and enter a task description');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/hybrid/${selectedAgent}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, priority }),
      });
      if (res.ok) {
        alert('Task assigned successfully');
        onSubmit?.();
        onClose();
      } else {
        alert('Failed to assign task');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: COLORS.white,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          padding: '32px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 700, color: COLORS.navy }}>
          Assign Task
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: COLORS.navy }}>
            Select Agent
          </label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${COLORS.lightGray}`,
              borderRadius: '8px',
            }}
          >
            <option value="">-- Choose an agent --</option>
            {agents.filter(a => a.status === STATUS.ONLINE).map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} (v{agent.version})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: COLORS.navy }}>
            Task Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task..."
            style={{
              width: '100%',
              height: '120px',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${COLORS.lightGray}`,
              borderRadius: '8px',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: COLORS.navy }}>
            Priority
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {Object.values(PRIORITY).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  flex: 1,
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  backgroundColor: priority === p ? COLORS.blue : COLORS.lightGray,
                  color: priority === p ? COLORS.white : COLORS.navy,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.lightGray,
              color: COLORS.navy,
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.blue,
              color: COLORS.white,
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Assigning...' : 'Assign Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HybridAgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/agents/hybrid');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleDeleteAgent = async (agentId) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      const res = await fetch(`/api/v1/agents/hybrid/${agentId}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Agent deleted successfully');
        fetchAgents();
        setSelectedAgent(null);
      } else {
        alert('Failed to delete agent');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: COLORS.lightGray,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ fontSize: '18px', color: COLORS.gray }}>Loading agents...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: COLORS.lightGray,
      fontFamily: 'Inter, sans-serif',
      padding: '32px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 700, color: COLORS.navy }}>
            Hybrid Agents Dashboard
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '16px', color: COLORS.gray }}>
            Manage your on-premise agents
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowTaskModal(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.white,
              color: COLORS.blue,
              border: `2px solid ${COLORS.blue}`,
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Assign Task
          </button>
          <button
            onClick={() => setShowDeployModal(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: COLORS.blue,
              color: COLORS.white,
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Deploy New Agent
          </button>
        </div>
      </div>

      {/* Monitoring Overview */}
      <MonitoringOverview agents={agents} />

      {/* Agent Grid */}
      {agents.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          backgroundColor: COLORS.white,
          borderRadius: '12px',
          color: COLORS.gray,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No agents deployed yet</div>
          <div style={{ fontSize: '14px' }}>Click "Deploy New Agent" to get started</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
        }}>
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} onClick={setSelectedAgent} />
          ))}
        </div>
      )}

      {/* Modals */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onConfigUpdate={fetchAgents}
          onTaskAssign={() => setShowTaskModal(true)}
        />
      )}

      {showDeployModal && (
        <DeployAgentModal onClose={() => setShowDeployModal(false)} />
      )}

      {showTaskModal && (
        <TaskAssignmentModal
          agents={agents}
          onClose={() => setShowTaskModal(false)}
          onSubmit={fetchAgents}
        />
      )}
    </div>
  );
}
