"use client";

import React from 'react';
import AppShell from './app-shell';
import StatCard, { StatIcons } from './stat-card';
import AgentsTable, { Agent } from './agents-table';
import { TopbarButton, TopbarIconButton } from './topbar';

// Mock data - replace with real data from API
const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'Customer Support Bot',
    type: 'Support',
    model: 'gpt-4-turbo',
    status: 'active',
    lastActive: '2 minutes ago',
  },
  {
    id: '2',
    name: 'Sales Assistant',
    type: 'Sales',
    model: 'claude-3-opus',
    status: 'idle',
    lastActive: '15 minutes ago',
  },
  {
    id: '3',
    name: 'Data Analyzer',
    type: 'Analytics',
    model: 'gpt-4-turbo',
    status: 'active',
    lastActive: 'Just now',
  },
  {
    id: '4',
    name: 'Content Generator',
    type: 'Content',
    model: 'claude-3-sonnet',
    status: 'error',
    lastActive: '1 hour ago',
  },
];

const mockStats = [
  {
    label: 'Active Agents',
    value: '12',
    change: { value: 8.5, trend: 'up' as const },
    icon: StatIcons.Agents,
    color: 'blue' as const,
  },
  {
    label: 'Tasks Completed',
    value: '2,847',
    change: { value: 12.3, trend: 'up' as const },
    icon: StatIcons.Tasks,
    color: 'green' as const,
  },
  {
    label: 'Messages Processed',
    value: '8,921',
    change: { value: 3.2, trend: 'down' as const },
    icon: StatIcons.Messages,
    color: 'purple' as const,
  },
  {
    label: 'API Calls',
    value: '145K',
    change: { value: 18.7, trend: 'up' as const },
    icon: StatIcons.ApiCalls,
    color: 'orange' as const,
  },
];

interface ActivityItem {
  action: string;
  time: string;
  type: 'success' | 'error' | 'info';
}

const mockActivity: ActivityItem[] = [
  { action: 'Agent "Customer Support Bot" completed 45 tasks', time: '5 minutes ago', type: 'success' },
  { action: 'New agent "Marketing Assistant" created', time: '12 minutes ago', type: 'info' },
  { action: 'Agent "Data Analyzer" encountered an error', time: '1 hour ago', type: 'error' },
  { action: 'System update completed successfully', time: '2 hours ago', type: 'success' },
];

export default function DashboardPage() {
  const handleCreateAgent = () => {
    console.log('Create new agent');
    // Navigate to agent creation page or open modal
  };

  const handleRefresh = () => {
    console.log('Refresh dashboard');
    // Refresh data
  };

  const handleAgentClick = (agent: Agent) => {
    console.log('Agent clicked:', agent);
    // Navigate to agent details page
  };

  const handleStatClick = (label: string) => {
    console.log('Stat card clicked:', label);
    // Navigate to relevant details page
  };

  return (
    <AppShell
      pageTitle="Dashboard"
      pageSubtitle="Monitor your agents and system performance"
      topbarActions={
        <>
          <TopbarIconButton
            onClick={handleRefresh}
            label="Refresh dashboard"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          />
          <TopbarIconButton
            onClick={() => console.log('Settings')}
            label="Open settings"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <TopbarButton
            variant="primary"
            onClick={handleCreateAgent}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            New Agent
          </TopbarButton>
        </>
      }
      user={{
        name: 'John Doe',
        email: 'john@vutler.com',
        initials: 'JD',
      }}
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {mockStats.map((stat, index) => (
          <StatCard 
            key={index} 
            {...stat} 
            onClick={() => handleStatClick(stat.label)}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-8" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#3b82f6] motion-safe:transition-colors motion-safe:duration-200">
              Create Agent
            </span>
          </button>

          <button className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#a855f7] to-[#9333ea] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#a855f7] motion-safe:transition-colors motion-safe:duration-200">
              Start Chat
            </span>
          </button>

          <button className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#22c55e] motion-safe:transition-colors motion-safe:duration-200">
              View Analytics
            </span>
          </button>

          <button className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] motion-safe:transition-all motion-safe:duration-200 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]">
            <div className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-white" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white group-hover:text-[#f59e0b] motion-safe:transition-colors motion-safe:duration-200">
              Browse Templates
            </span>
          </button>
        </div>
      </section>

      {/* Agents Table */}
      <section className="mb-8" aria-labelledby="agents-title">
        <div className="flex items-center justify-between mb-4">
          <h2 id="agents-title" className="text-lg font-semibold text-white">Active Agents</h2>
          <a 
            href="/agents" 
            className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium motion-safe:transition-colors motion-safe:duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-2 py-1"
          >
            View all →
          </a>
        </div>
        <AgentsTable agents={mockAgents} onAgentClick={handleAgentClick} />
      </section>

      {/* Recent Activity */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6" aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <ul className="space-y-4" role="list">
          {mockActivity.map((activity, index) => (
            <li key={index} className="flex items-start space-x-3 pb-4 border-b border-[rgba(255,255,255,0.07)] last:border-0 last:pb-0">
              <div 
                className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                  activity.type === 'success' ? 'bg-[#22c55e]' :
                  activity.type === 'error' ? 'bg-red-500' :
                  'bg-[#3b82f6]'
                }`} 
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{activity.action}</p>
                <p className="text-xs text-[#6b7280] mt-1">
                  <time>{activity.time}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
