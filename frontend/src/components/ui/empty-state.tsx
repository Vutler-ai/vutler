import { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-4 py-16 text-center ${className ?? ''}`}
    >
      <div className="mb-4 rounded-full bg-[#14151f] p-4">
        <Icon className="h-8 w-8 text-gray-500" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-white">{title}</h3>
      {description && <p className="mb-6 max-w-xs text-sm text-gray-400">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
