'use client';

import Topbar, { TopbarButton } from '@/components/topbar';
import AgentsTable from '@/components/agents-table';

export default function AgentsPage() {
  return (
    <>
      <Topbar title="Agents" subtitle="Manage your AI agents" actions={
        <TopbarButton variant="primary" onClick={() => window.location.href = '/agents/new'}>+ New Agent</TopbarButton>
      } />
      <main className="flex-1 p-6">
        <AgentsTable agents={[]} onAgentClick={(id) => console.log('agent', id)} />
      </main>
    </>
  );
}
