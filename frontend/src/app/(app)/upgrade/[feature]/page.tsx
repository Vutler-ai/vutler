'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarDays, FolderOpen, Mail, MessageSquare, PlugZap, ShieldAlert, Wrench, Server, FlaskConical, BrainCircuit } from 'lucide-react';

const FEATURE_COPY: Record<string, {
  title: string;
  description: string;
  suggestedPlan: string;
  icon: typeof MessageSquare;
}> = {
  chat: {
    title: 'Chat workspace',
    description: 'Le chat Vutler orchestre les agents, les artefacts et les actions internes du workspace.',
    suggestedPlan: 'Office Starter',
    icon: MessageSquare,
  },
  tasks: {
    title: 'Tasks',
    description: 'Les tâches synchronisent le travail asynchrone entre agents, équipe et automation runtime.',
    suggestedPlan: 'Office Starter',
    icon: BrainCircuit,
  },
  email: {
    title: 'Email',
    description: 'Le module email donne accès aux boîtes, brouillons, routage agent et domaines internes.',
    suggestedPlan: 'Office Starter',
    icon: Mail,
  },
  drive: {
    title: 'Drive',
    description: 'Le Drive sert de couche de dépôt et de récupération de documents pour les agents et le chat.',
    suggestedPlan: 'Office Starter',
    icon: FolderOpen,
  },
  calendar: {
    title: 'Calendar',
    description: 'Le calendrier gère les événements, disponibilités et liens directs depuis les réponses agent.',
    suggestedPlan: 'Office Starter',
    icon: CalendarDays,
  },
  agents: {
    title: 'Agents',
    description: 'La surface Agents permet de créer, configurer et piloter les agents du workspace.',
    suggestedPlan: 'Agents Starter',
    icon: Wrench,
  },
  nexus: {
    title: 'Nexus',
    description: 'Nexus provisionne et pilote les nœuds runtime externes rattachés au workspace.',
    suggestedPlan: 'Agents Starter',
    icon: Server,
  },
  sandbox: {
    title: 'Sandbox',
    description: 'Le sandbox exécute du code et des runs contrôlés pour les agents et workflows.',
    suggestedPlan: 'Agents Starter',
    icon: FlaskConical,
  },
  providers: {
    title: 'Providers',
    description: 'Les providers centralisent les credentials et endpoints LLM disponibles pour le workspace.',
    suggestedPlan: 'Agents Starter',
    icon: PlugZap,
  },
  integrations: {
    title: 'Integrations',
    description: 'Les intégrations connectent Vutler aux outils externes et exposent des capacités runtime aux agents.',
    suggestedPlan: 'Office Starter',
    icon: PlugZap,
  },
};

function humanizeFeature(feature: string): string {
  return feature
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function UpgradeFeaturePage() {
  const params = useParams<{ feature: string }>();
  const searchParams = useSearchParams();
  const feature = String(params?.feature || 'workspace').toLowerCase();
  const copy = FEATURE_COPY[feature] || {
    title: humanizeFeature(feature),
    description: 'Cette fonctionnalite n’est pas incluse dans le plan actuel du workspace.',
    suggestedPlan: 'a paid plan',
    icon: ShieldAlert,
  };
  const from = searchParams?.get('from') || null;
  const Icon = copy.icon;

  const breadcrumbs = useMemo(() => {
    if (!from) return null;
    return from.split('?')[0];
  }, [from]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))]">
        <div className="border-b border-white/10 px-6 py-5 sm:px-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            Plan required
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {copy.title} n&apos;est pas disponible sur ce plan
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                {copy.description}
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-blue-300">
              <Icon className="h-7 w-7" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recommended unlock</p>
            <p className="mt-2 text-2xl font-semibold text-white">{copy.suggestedPlan}</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Active ce plan pour exposer la fonctionnalite dans la navigation, dans les pages app et dans les actions agent liees.
            </p>
            {breadcrumbs && (
              <p className="mt-4 text-xs text-slate-500">
                Requested from: <span className="font-mono text-slate-300">{breadcrumbs}</span>
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next step</p>
            <div className="mt-4 space-y-3">
              <Link
                href="/billing"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-400"
              >
                Open billing
                <ArrowRight className="h-4 w-4" />
              </Link>
              {from && (
                <Link
                  href={from}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/5"
                >
                  Back
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
