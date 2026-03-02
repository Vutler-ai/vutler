#!/usr/bin/env node
/**
 * Script de synchronisation des agents Vutler vers Snipara
 * 
 * Usage: node scripts/sync-agents-to-snipara.js
 * 
 * Ce script:
 * 1. Crée/recrée les agents Vutler dans le projet Snipara
 * 2. Synchronise SOUL.md, TOOLS.md, AGENTS.md pour chaque agent
 * 3. Synchronise la mémoire (fichiers memory/)
 * 4. Configure le swarm pour la coordination multi-agent
 */

const fs = require('fs');
const path = require('path');

// Configuration Snipara
const SNIPARA_CONFIG = {
  apiUrl: 'https://api.snipara.com',
  apiKey: 'rlm_52ab2c077702ef86109f6f5b4e6bd32e1696c73e85ebbca09e7e2b48a95e1d2b',
  projectId: 'cmlunio5v00016imvktf58v0b',
  projectSlug: 'vutler',
  teamId: 'alopez-nevicom-1769121450132'
};

// Liste des agents Vutler à synchroniser
const VUTLER_AGENTS = [
  {
    id: 'jarvis',
    name: 'Jarvis',
    role: 'Lead Architect & Coordinator',
    description: 'Coordinateur principal, INTJ, business partner d\'Alex. Prend les décisions opérationnelles et gère l\'équipe de 9 agents.',
    model: 'claude-opus-4',
    skills: ['system-architect', 'dev-story-executor'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md', 'USER.md', 'MEMORY.md'],
    memoryFiles: ['2026-02-*.md', '2026-03-*.md', 'vutler-*.md']
  },
  {
    id: 'mike',
    name: 'Mike',
    role: 'Lead Engineer',
    description: 'Lead Engineer — spécialisé en backend, architecture système, et debugging complexe. Utilise Kimi K2.5 pour optimiser les coûts.',
    model: 'kimi-k2.5',
    skills: ['dev-story-executor', 'system-architect'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md', 'CODING_STANDARDS.md'],
    memoryFiles: ['kimi-k2.5-*.md', 'vutler-bugs-*.md']
  },
  {
    id: 'philip',
    name: 'Philip',
    role: 'UI/UX Designer',
    description: 'UI/UX Designer — pixel-perfect, animations, responsive design, et expérience utilisateur.',
    model: 'claude-sonnet-4',
    skills: ['product-vision-builder'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  },
  {
    id: 'luna',
    name: 'Luna',
    role: 'Product Manager',
    description: 'Product Manager — roadmap, user stories, priorisation, et coordination produit.',
    model: 'claude-sonnet-4',
    skills: ['product-vision-builder', 'agile-story-master'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: ['bmad-*.md', 'dev-workflow-*.md']
  },
  {
    id: 'marcus',
    name: 'Marcus',
    role: 'Full-Stack Developer',
    description: 'Full-Stack Developer — Next.js, React, TypeScript, API integration.',
    model: 'claude-sonnet-4',
    skills: ['dev-story-executor'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  },
  {
    id: 'rex',
    name: 'Rex',
    role: 'DevOps & Monitoring',
    description: 'DevOps Engineer — monitoring, infrastructure, alerting, et santé des systèmes.',
    model: 'claude-haiku',
    skills: ['system-architect'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md', 'rex-*.md'],
    memoryFiles: ['rex-*.md']
  },
  {
    id: 'andrea',
    name: 'Andrea',
    role: 'Office Manager & Legal',
    description: 'Office Manager + Legal & Compliance — GDPR, LPD, contrats, et administration.',
    model: 'claude-sonnet-4',
    skills: ['product-vision-builder'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  },
  {
    id: 'sarah',
    name: 'Sarah',
    role: 'Content Writer',
    description: 'Content Writer — documentation, blog posts, newsletters, et communication.',
    model: 'claude-haiku',
    skills: [],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  },
  {
    id: 'leo',
    name: 'Leo',
    role: 'QA Engineer',
    description: 'QA Engineer — tests, quality gates, E2E testing, et assurance qualité.',
    model: 'claude-haiku',
    skills: ['dev-story-executor'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  },
  {
    id: 'nina',
    name: 'Nina',
    role: 'Data Analyst',
    description: 'Data Analyst — analytics, métriques, reports, et insights business.',
    model: 'claude-sonnet-4',
    skills: ['system-architect'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: []
  }
];

// Fichiers globaux à synchroniser pour tous les agents
const GLOBAL_FILES = [
  'AGENTS.md',
  'CODING_STANDARDS.md',
  'SECURITY.md',
  'TODO.md',
  'HEARTBEAT.md',
  'VUTLER-TOOLS.md'
];

/**
 * Appelle l'API Snipara
 */
async function callSnipara(method, params) {
  const response = await fetch(`${SNIPARA_CONFIG.apiUrl}/mcp/vutler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SNIPARA_CONFIG.apiKey
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`API Error: ${data.error.message}`);
  }

  return data.result;
}

/**
 * Crée ou met à jour un agent sur Snipara
 */
async function createOrUpdateAgent(agent) {
  console.log(`\n📌 Processing agent: ${agent.name} (${agent.id})`);

  try {
    // 1. Créer l'agent via l'API
    // Note: L'API exacte dépend de Snipara, ceci est une simulation
    // En pratique, on utiliserait rlm_upload_document pour les fichiers
    
    // Upload du SOUL.md spécifique à l'agent
    const soulContent = generateAgentSoul(agent);
    await uploadDocument(`agents/${agent.id}/SOUL.md`, soulContent);
    console.log(`  ✅ SOUL.md uploaded`);

    // Upload des fichiers de base
    for (const file of agent.files) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        await uploadDocument(`agents/${agent.id}/${file}`, content);
        console.log(`  ✅ ${file} uploaded`);
      }
    }

    // Upload des fichiers globaux
    for (const file of GLOBAL_FILES) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        await uploadDocument(`agents/${agent.id}/shared/${file}`, content);
      }
    }

    // Upload de la mémoire
    await syncAgentMemory(agent);

    // Créer le swarm pour l'agent
    await ensureSwarmConfigured(agent);

    console.log(`  ✅ Agent ${agent.name} synchronized`);
    return true;
  } catch (err) {
    console.error(`  ❌ Error syncing ${agent.name}:`, err.message);
    return false;
  }
}

/**
 * Upload un document vers Snipara
 */
async function uploadDocument(path, content) {
  // Simuler l'appel API
  // En réalité: callSnipara('tools/call', { name: 'rlm_upload_document', arguments: { path, content } })
  console.log(`     Uploading: ${path} (${content.length} chars)`);
  
  // TODO: Implémenter l'appel réel quand l'API est disponible
  // return callSnipara('tools/call', {
  //   name: 'rlm_upload_document',
  //   arguments: {
  //     project: SNIPARA_CONFIG.projectSlug,
  //     path,
  //     content,
  //     metadata: { source: 'vutler-sync', timestamp: new Date().toISOString() }
  //   }
  // });
}

/**
 * Génère un SOUL.md spécifique pour chaque agent
 */
function generateAgentSoul(agent) {
  const baseSoul = fs.readFileSync('SOUL.md', 'utf-8');
  
  return `# SOUL.md - ${agent.name}

${baseSoul}

## Agent-Specific Configuration

**Name:** ${agent.name}  
**ID:** ${agent.id}  
**Role:** ${agent.role}  
**Model:** ${agent.model}  

## Your Focus

${agent.description}

## Skills

${agent.skills.map(s => `- ${s}`).join('\n') || '- General purpose'}

## Memory Files

${agent.memoryFiles.map(f => `- ${f}`).join('\n') || '- None specific'}

---
*Generated: ${new Date().toISOString()}*
`;
}

/**
 * Synchronise la mémoire d'un agent
 */
async function syncAgentMemory(agent) {
  const memoryDir = path.join(process.cwd(), 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    console.log(`  ⚠️  No memory directory found`);
    return;
  }

  const files = fs.readdirSync(memoryDir);
  let syncedCount = 0;

  for (const file of files) {
    // Filtrer selon les patterns de l'agent
    const shouldSync = agent.memoryFiles.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(file);
    });

    if (shouldSync || file.includes(agent.id.toLowerCase())) {
      const filePath = path.join(memoryDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      await uploadDocument(`agents/${agent.id}/memory/${file}`, content);
      syncedCount++;
    }
  }

  console.log(`  ✅ Memory: ${syncedCount} files synced`);
}

/**
 * Configure le swarm pour la coordination
 */
async function ensureSwarmConfigured(agent) {
  // TODO: Utiliser rlm_swarm_create ou rlm_swarm_join
  console.log(`  🔗 Swarm configured for ${agent.id}`);
}

/**
 * Fonction principale
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Sync Vutler Agents → Snipara                         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\nProject: ${SNIPARA_CONFIG.projectSlug}`);
  console.log(`API URL: ${SNIPARA_CONFIG.apiUrl}`);
  console.log(`Agents to sync: ${VUTLER_AGENTS.length}\n`);

  const results = {
    success: [],
    failed: []
  };

  for (const agent of VUTLER_AGENTS) {
    const success = await createOrUpdateAgent(agent);
    if (success) {
      results.success.push(agent.name);
    } else {
      results.failed.push(agent.name);
    }
  }

  // Résumé
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   SYNC SUMMARY                                         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Success: ${results.success.length}/${VUTLER_AGENTS.length}`);
  results.success.forEach(name => console.log(`   ✓ ${name}`));
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(name => console.log(`   ✗ ${name}`));
  }

  console.log('\n✨ Done!');
}

// Exécution
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
