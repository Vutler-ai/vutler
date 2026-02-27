import AgentDetailClient from "./agent-detail-client";

// Required for static export with dynamic routes
export async function generateStaticParams() {
  // Generate a default set of agent IDs for static build
  // In production, these will be client-side routed anyway
  const defaultAgents = ["jarvis", "mike", "philip", "luna", "andrea", "max", "victor", "oscar", "nora", "stephen", "sentinel", "marcus", "rex"];
  return defaultAgents.map(id => ({ id }));
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentDetailClient agentId={id} />;
}
