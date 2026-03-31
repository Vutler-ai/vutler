'use strict';

function estimateTokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}

function stringifyMemory(memory = {}) {
  const type = String(memory.type || 'fact').trim();
  const text = String(memory.text || '').trim();
  return text ? `- [${type}] ${text}` : '';
}

function stringifyMemorySection(title, memories = []) {
  const lines = memories.map(stringifyMemory).filter(Boolean);
  if (lines.length === 0) return '';
  return `## ${title}\n${lines.join('\n')}`;
}

function stringifyTextSection(title, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `## ${title}\n${text}`;
}

function trimSectionsToBudget(sections = [], budgetTokens = 1200) {
  const accepted = [];
  let used = 0;

  for (const section of sections) {
    const text = String(section || '').trim();
    if (!text) continue;

    const cost = estimateTokenCount(text);
    if (accepted.length > 0 && (used + cost) > budgetTokens) break;

    accepted.push(text);
    used += cost;
  }

  return {
    prompt: accepted.join('\n\n').trim(),
    tokens: used,
    sections: accepted,
  };
}

function buildMemoryPrompt({
  sharedContext = '',
  instanceMemories = [],
  templateMemories = [],
  globalMemories = [],
  summaries = [],
  deepContext = '',
  plan = '',
  budgetTokens = 1200,
} = {}) {
  const rawSections = [
    stringifyTextSection('Shared Context', sharedContext),
    stringifyMemorySection('Agent Memory', instanceMemories),
    stringifyMemorySection('Role Memory', templateMemories),
    stringifyMemorySection('Workspace Memory', globalMemories),
    stringifyMemorySection('Summaries', summaries),
    stringifyTextSection('Deep Context', deepContext),
    stringifyTextSection('Plan', plan),
  ].filter(Boolean);

  return trimSectionsToBudget(rawSections, budgetTokens);
}

module.exports = {
  estimateTokenCount,
  stringifyMemory,
  stringifyMemorySection,
  buildMemoryPrompt,
};
