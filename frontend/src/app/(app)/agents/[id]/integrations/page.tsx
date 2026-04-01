'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AgentIntegrationsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
        <CardHeader>
          <CardTitle>Workspace Integrations Moved</CardTitle>
          <CardDescription className="text-[#9ca3af]">
            Integrations are no longer configured per agent. This screen is kept only as a transition surface for legacy links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-blue-500/20 bg-blue-500/5 text-blue-100">
            <AlertTitle>New model</AlertTitle>
            <AlertDescription>
              Workspace connectors live in global settings. Agent-specific configuration now happens in two places:
              access policy and channels &amp; provisioning.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm text-[#9ca3af]">
            <p>Use agent settings to control:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>what the agent is allowed to use at runtime</li>
              <li>which email identity, drive root, or social scope is provisioned for this agent</li>
              <li>memory and governance policy</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/agents/${id}/config`}>Open Agent Settings</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/integrations">Open Workspace Integrations</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
