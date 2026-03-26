'use strict';

/**
 * Seed templates + skills loader
 * Reads agent-templates.json and agent-skills.json and upserts them
 * into the tenant_vutler.marketplace_templates table on startup.
 */

const path = require('path');
const fs = require('fs');

let pool;
try {
  pool = require('../lib/vaultbrix');
} catch (_) {
  // No DB pool available — skip DB seeding silently
}

const SCHEMA = 'tenant_vutler';
const SEEDS_DIR = path.join(__dirname);

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, filename), 'utf8'));
  } catch (err) {
    console.warn(`[SEEDS] Could not read ${filename}:`, err.message);
    return null;
  }
}

/**
 * Returns the parsed agent-templates.json data (for in-memory use).
 */
function getAgentTemplates() {
  return readJson('agent-templates.json') || [];
}

/**
 * Returns the parsed agent-skills.json data (for in-memory use).
 */
function getAgentSkills() {
  return readJson('agent-skills.json') || {};
}

/**
 * Upserts agent templates from agent-templates.json into the DB.
 * Safe to call on every startup — uses INSERT ... ON CONFLICT DO NOTHING
 * based on the template name (since we don't control the serial id).
 */
async function seedTemplatesToDb(db) {
  const templates = getAgentTemplates();
  if (!templates.length) return;

  // Ensure the skills column exists (non-breaking ALTER TABLE)
  try {
    await db.query(
      `ALTER TABLE ${SCHEMA}.marketplace_templates ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'`
    );
    await db.query(
      `ALTER TABLE ${SCHEMA}.marketplace_templates ADD COLUMN IF NOT EXISTS avatar VARCHAR(100)`
    );
  } catch (_) {}

  let inserted = 0;
  for (const tpl of templates) {
    try {
      const systemPrompt = tpl.system_prompt || '';
      const result = await db.query(
        `INSERT INTO ${SCHEMA}.marketplace_templates
           (workspace_id, agent_id, name, description, category, model, system_prompt,
            skills, tools, permissions, pricing, price, verified, avatar)
         VALUES (1, 0, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, '{}'::jsonb, 'free', 0, true, $8)
         ON CONFLICT DO NOTHING`,
        [
          tpl.name,
          tpl.description || '',
          tpl.category || 'custom',
          tpl.model || 'gpt-4o',
          systemPrompt,
          JSON.stringify(tpl.skills || []),
          JSON.stringify(tpl.tools || []),
          tpl.avatar || null,
        ]
      );
      if (result.rowCount > 0) inserted++;
    } catch (err) {
      console.warn(`[SEEDS] Could not insert template "${tpl.name}":`, err.message);
    }
  }

  if (inserted > 0) {
    console.log(`[SEEDS] Inserted ${inserted} agent templates`);
  }
}

/**
 * Main entry point called from index.js on startup.
 */
async function loadTemplates() {
  console.log('[SEEDS] Loading agent templates and skills...');

  // Always validate JSON is readable
  const templates = getAgentTemplates();
  const skills = getAgentSkills();

  console.log(`[SEEDS] ${templates.length} agent templates loaded from JSON`);
  console.log(`[SEEDS] ${Object.keys(skills).length} skills loaded from JSON`);

  // Seed to DB if pool is available
  if (pool) {
    try {
      await seedTemplatesToDb(pool);
    } catch (err) {
      console.warn('[SEEDS] DB seed failed (non-fatal):', err.message);
    }
  }

  return { templates, skills };
}

module.exports = { loadTemplates, getAgentTemplates, getAgentSkills };
