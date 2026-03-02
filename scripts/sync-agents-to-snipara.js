#!/usr/bin/env node
/**
 * Script de synchronisation des agents Vutler vers Snipara
 * 
 * Usage: node scripts/sync-agents-to-snipara.js [--dry-run] [--agent=jarvis]
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

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const specificAgent = args.find(a => a.startsWith('--agent='))?.split('=')[1];

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
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
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
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Security & Threat Intelligence',
    description: 'Security Analyst — threat detection, vulnerability scanning, security audits, and incident response. Monitors all Starbox Group infrastructure.',
    model: 'claude-sonnet-4',
    skills: ['system-architect'],
    files: ['SOUL.md', 'TOOLS.md', 'AGENTS.md'],
    memoryFiles: ['sentinel-*.md', 'rex-pentest-*.md', 'rex-secret-*.md', 'audit-*.md']
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
 * Appelle l'API Snipara avec fetch
 */
async function callSnipara(tool, args) {
  if (dryRun) {
    console.log(`    [DRY RUN] ${tool}`, JSON.stringify(args).slice(0, 100) + '...');
    return { success: true, dryRun: true };
  }

  const response = await fetch(`${SNIPARA_CONFIG.apiUrl}/mcp/vutler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SNIPARA_CONFIG.apiKey
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

/**
 * Test la connexion à Snipara
 */
async function testConnection() {
  console.log('🔌 Testing Snipara connection...');
  try {
    // Essayer de charger le projet
    const result = await callSnipara('rlm_load_project', {
      project: SNIPARA_CONFIG.projectSlug
    });
    console.log('✅ Connection successful!');
    if (result && result.sections) {
      console.log(`   Found ${result.sections.length} sections in project`);
    }
    return true;
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  }
}

/**
 * Upload un document vers Snipara
 */
async function uploadDocument(docPath, content, metadata = {}) {
  try {
    await callSnipara('rlm_upload_document', {
      project: SNIPARA_CONFIG.projectSlug,
      path: docPath,
      content: content,
      metadata: {
        source: 'vutler-sync',
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
    return true;
  } catch (err) {
    console.error(`     ❌ Failed to upload ${docPath}:`, err.message);
    return false;
  }
}

/**
 * Génère un SOUL.md spécifique pour chaque agent
 */
function generateAgentSoul(agent) {
  const baseSoul = fs.existsSync('SOUL.md') ? fs.readFileSync('SOUL.md', 'utf-8') : '# Agent Configuration\n\nNo base SOUL.md found.';
  
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
*Source: Vutler Agent Sync*
`;
}

/**
 * Synchronise la mémoire d'un agent
 */
async function syncAgentMemory(agent) {
  const memoryDir = path.join(process.cwd(), 'memory');
  
  if (!fs.existsSync(memoryDir)) {
    console.log(`  ⚠️  No memory directory found`);
    return 0;
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
      const success = await uploadDocument(`agents/${agent.id}/memory/${file}`, content, { agent: agent.id });
      if (success) {
        syncedCount++;
        console.log(`     ✅ memory/${file}`);
      }
    }
  }

  return syncedCount;
}

/**
 * Stocke une mémoire structurée pour l'agent
 */
async function storeAgentMemory(agent, type, content, metadata = {}) {
  try {
    await callSnipara('rlm_remember', {
      project: SNIPARA_CONFIG.projectSlug,
      agent: agent.id,
      type: type, // 'fact', 'decision', 'learning', 'preference', 'todo'
      content: content,
      metadata: {
        agent_name: agent.name,
        agent_role: agent.role,
        ...metadata
      }
    });
    return true;
  } catch (err) {
    console.error(`     ❌ Failed to store memory:`, err.message);
    return false;
  }
}

/**
 * Crée ou met à jour un agent sur Snipara
 */
async function createOrUpdateAgent(agent) {
  console.log(`\n📌 Processing agent: ${agent.name} (${agent.id})`);

  try {
    // 1. Upload du SOUL.md spécifique à l'agent
    const soulContent = generateAgentSoul(agent);
    let success = await uploadDocument(`agents/${agent.id}/SOUL.md`, soulContent, { agent: agent.id, type: 'soul' });
    if (success) console.log(`  ✅ SOUL.md uploaded`);

    // 2. Upload des fichiers de base de l'agent
    for (const file of agent.files) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        success = await uploadDocument(`agents/${agent.id}/${file}`, content, { agent: agent.id, type: 'config' });
        if (success) console.log(`  ✅ ${file} uploaded`);
      } else {
        console.log(`  ⚠️  ${file} not found locally`);
      }
    }

    // 3. Upload des fichiers globaux
    console.log(`  📁 Uploading shared files...`);
    for (const file of GLOBAL_FILES) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        success = await uploadDocument(`agents/${agent.id}/shared/${file}`, content, { agent: agent.id, type: 'shared' });
        if (success) console.log(`     ✅ shared/${file}`);
      }
    }

    // 4. Upload de la mémoire
    console.log(`  🧠 Syncing memory...`);
    const memoryCount = await syncAgentMemory(agent);
    console.log(`  ✅ Memory: ${memoryCount} files synced`);

    // 5. Stocker des méta-informations comme mémoire structurée
    console.log(`  💾 Storing agent metadata...`);
    await storeAgentMemory(agent, 'fact', `I am ${agent.name}, a ${agent.role} at Vutler. My model is ${agent.model}.`, { key: 'agent_identity' });
    await storeAgentMemory(agent, 'preference', `My skills include: ${agent.skills.join(', ') || 'general purpose'}`, { key: 'agent_skills' });

    console.log(`  ✅ Agent ${agent.name} synchronized`);
    return true;
  } catch (err) {
    console.error(`  ❌ Error syncing ${agent.name}:`, err.message);
    return false;
  }
}

/**
 * Configure le swarm pour tous les agents
 */
async function setupSwarm(agents) {
  console.log('\n🔗 Setting up Vutler Swarm...');
  
  try {
    // Créer le swarm
    const result = await callSnipara('rlm_swarm_create', {
      project: SNIPARA_CONFIG.projectSlug,
      name: 'vutler-team',
      description: 'Vutler AI Agent Team - 10 agents coordinating on the Vutler platform',
      agents: agents.map(a => a.id),
      config: {
        auto_broadcast: true,
        task_distribution: 'round_robin'
      }
    });
    
    console.log('✅ Swarm configured');
    return result;
  } catch (err) {
    console.error('❌ Failed to setup swarm:', err.message);
    return null;
  }
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
  console.log(`Mode: ${dryRun ? 'DRY RUN (no actual API calls)' : 'LIVE'}`);

  // Filtrer les agents si spécifié
  let agentsToSync = VUTLER_AGENTS;
  if (specificAgent) {
    agentsToSync = VUTLER_AGENTS.filter(a => a.id === specificAgent);
    if (agentsToSync.length === 0) {
      console.error(`❌ Agent ${specificAgent} not found`);
      process.exit(1);
    }
  }
  
  console.log(`Agents to sync: ${agentsToSync.length}\n`);

  // Tester la connexion
  if (!dryRun) {
    const connected = await testConnection();
    if (!connected) {
      console.error('\n❌ Cannot connect to Snipara API. Exiting.');
      process.exit(1);
    }
  }

  // Synchroniser chaque agent
  const results = {
    success: [],
    failed: []
  };

  for (const agent of agentsToSync) {
    const success = await createOrUpdateAgent(agent);
    if (success) {
      results.success.push(agent.name);
    } else {
      results.failed.push(agent.name);
    }
  }

  // Configurer le swarm
  if (!specificAgent) {
    await setupSwarm(VUTLER_AGENTS);
  }

  // Résumé
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   SYNC SUMMARY                                         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Success: ${results.success.length}/${agentsToSync.length}`);
  results.success.forEach(name => console.log(`   ✓ ${name}`));
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(name => console.log(`   ✗ ${name}`));
  }

  console.log('\n✨ Done!');
  
  if (dryRun) {
    console.log('\n💡 This was a dry run. Remove --dry-run to actually sync.');
  }
}

// Exécution
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
