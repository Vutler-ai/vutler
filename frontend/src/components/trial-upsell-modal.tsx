'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface TrialUpsellModalProps {
  open: boolean
  onClose: () => void
  expired?: boolean // true if trial expired vs just exhausted
}

interface OptionCardProps {
  icon: string
  label: string
  description: string
  onClick: () => void
}

function OptionCard({ icon, label, description, onClick }: OptionCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl bg-[#1e293b] p-4 text-left transition-colors hover:bg-[#1e293b]/80 cursor-pointer"
    >
      <span className="text-2xl leading-none" aria-hidden="true">
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-slate-400">{description}</span>
      </div>
    </button>
  )
}

export function TrialUpsellModal({
  open,
  onClose,
  expired = false,
}: TrialUpsellModalProps) {
  const router = useRouter()

  const navigate = (path: string) => {
    onClose()
    router.push(path)
  }

  const title = expired
    ? 'Votre essai a expiré'
    : "Vos crédits d'essai sont épuisés"

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md border border-[rgba(255,255,255,0.1)] bg-[#0f172a] p-6 text-white"
      >
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold text-white">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-400">
            Configurez un accès LLM pour que vos agents continuent à travailler.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <OptionCard
            icon="🔗"
            label="Connecter OpenAI"
            description="Connectez votre compte en un clic"
            onClick={() => navigate('/settings/integrations')}
          />
          <OptionCard
            icon="🔑"
            label="Ajouter une clé API"
            description="OpenAI, Anthropic, ou OpenRouter"
            onClick={() => navigate('/settings')}
          />
          <OptionCard
            icon="💳"
            label="Acheter des crédits"
            description="Packs à partir de $5"
            onClick={() => navigate('/billing')}
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline"
          >
            Plus tard
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default TrialUpsellModal
