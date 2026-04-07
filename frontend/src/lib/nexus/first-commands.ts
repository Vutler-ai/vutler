export type NexusFirstCommandPresetKey =
  | 'desktop'
  | 'documents-search'
  | 'clipboard'
  | 'pwd';

export type NexusFirstCommandAction =
  | 'list_dir'
  | 'search'
  | 'read_clipboard'
  | 'shell_exec';

export interface NexusFirstCommandPreset {
  key: NexusFirstCommandPresetKey;
  title: string;
  description: string;
  action: NexusFirstCommandAction;
  value: string;
  valueLabel: string;
}

export const NEXUS_FIRST_COMMAND_PRESETS: NexusFirstCommandPreset[] = [
  {
    key: 'desktop',
    title: 'List Desktop',
    description: 'Check file access on `~/Desktop`.',
    action: 'list_dir',
    value: '~/Desktop',
    valueLabel: 'Path',
  },
  {
    key: 'documents-search',
    title: 'Search Documents',
    description: 'Look for `report` inside `~/Documents`.',
    action: 'search',
    value: 'report',
    valueLabel: 'Query',
  },
  {
    key: 'clipboard',
    title: 'Read Clipboard',
    description: 'Verify the local clipboard bridge.',
    action: 'read_clipboard',
    value: '',
    valueLabel: 'Input',
  },
  {
    key: 'pwd',
    title: 'Run `pwd`',
    description: 'Validate the shell runtime path.',
    action: 'shell_exec',
    value: 'pwd',
    valueLabel: 'Command',
  },
];

export function getNexusFirstCommandPreset(key: NexusFirstCommandPresetKey): NexusFirstCommandPreset {
  const preset = NEXUS_FIRST_COMMAND_PRESETS.find((entry) => entry.key === key);
  if (!preset) {
    throw new Error(`Unknown Nexus first command preset: ${key}`);
  }
  return preset;
}
