# Nexus Multi-Agent Prototype

**Date:** 2026-03-01 20:53  
**Owner:** Jarvis  
**Approuvé par:** Alex Lopez  
**Goal:** Prototype rapide (2-3 jours) pour valider concept multi-agent local

---

## 🎯 Vision

**Nexus devient orchestrateur d'agents locaux**, comme OpenClaw mais plus simple:

```
User: "Fix ce bug"
  ↓
Nexus Router
  ↓
  ├─ Simple → Execute local (Gemini FREE)
  ├─ Code → Spawn Mike (Kimi K2.5, $0.03)
  ├─ Design → Spawn Philip (Sonnet, $0.05)
  └─ Complex → Cloud Agent (Opus, $0.45)
```

**Bénéfices:**
- 💰 **Cost optimization:** Gemini gratuit pour 60% des requêtes
- 🎯 **Specialization:** Bon model pour bon job
- ⚡ **Speed:** Process-based, pas besoin cloud roundtrip
- 🔒 **Privacy:** Tout reste local

---

## 📋 Prototype Scope (2-3 jours)

### Phase 1: Architecture (Jour 1, 4h)
- [ ] Design agent config file (`~/.vutler/agents.json`)
- [ ] Créer `NexusOrchestrator` class
- [ ] Implémenter `spawn(agentId, task)` method
- [ ] Process-based execution (child_process)

### Phase 2: 2 Agents de Base (Jour 1-2, 8h)
- [ ] **Mike Agent** (Kimi K2.5) — Code tasks
- [ ] **Gemini Agent** (FREE) — General tasks
- [ ] Config models via OpenRouter
- [ ] Return result to main session

### Phase 3: Smart Routing (Jour 2, 4h)
- [ ] Auto-detect task type:
  - Keywords: "code", "bug", "fix" → Mike
  - Keywords: "design", "wireframe", "UI" → Gemini (for now)
  - Default → Gemini
- [ ] Fallback to main Nexus if spawn fails

### Phase 4: Testing (Jour 3, 4h)
- [ ] Test: Code bug fix → Mike
- [ ] Test: General question → Gemini
- [ ] Test: Cost tracking
- [ ] Test: Error handling (agent crash, timeout)

**Total:** 20h réparties sur 2-3 jours

---

## 🛠️ Architecture Technique

### Agent Config File

**Location:** `~/.vutler/agents.json`

```json
{
  "version": "1.0",
  "agents": [
    {
      "id": "gemini",
      "name": "Gemini Agent (General)",
      "model": "google/gemini-2.0-flash-thinking-exp:free",
      "provider": "openrouter",
      "skills": ["general", "research", "writing"],
      "cost": 0,
      "enabled": true
    },
    {
      "id": "mike",
      "name": "Mike (Code Expert)",
      "model": "moonshotai/kimi-k2.5",
      "provider": "openrouter",
      "skills": ["coding", "debugging", "architecture"],
      "costPerMillion": 0.60,
      "enabled": true
    },
    {
      "id": "philip",
      "name": "Philip (UI/UX)",
      "model": "anthropic/claude-sonnet-4-5",
      "provider": "openrouter",
      "skills": ["design", "ui", "wireframes"],
      "costPerMillion": 3.00,
      "enabled": false
    }
  ],
  "routing": {
    "default": "gemini",
    "keywords": {
      "code": ["mike"],
      "bug": ["mike"],
      "fix": ["mike"],
      "debug": ["mike"],
      "design": ["philip"],
      "wireframe": ["philip"],
      "ui": ["philip"]
    }
  }
}
```

### Nexus Orchestrator Class

**File:** `lib/orchestrator.js`

```javascript
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class NexusOrchestrator {
  constructor(configPath = '~/.vutler/agents.json') {
    this.configPath = configPath.replace('~', require('os').homedir());
    this.config = this.loadConfig();
    this.sessions = new Map(); // Track active agent sessions
  }

  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Agent config not found: ${this.configPath}`);
    }
    return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
  }

  routeTask(task) {
    // Check keywords
    const taskLower = task.toLowerCase();
    
    for (const [keyword, agentIds] of Object.entries(this.config.routing.keywords)) {
      if (taskLower.includes(keyword)) {
        return agentIds[0]; // Pick first matching agent
      }
    }
    
    // Default to gemini (free)
    return this.config.routing.default;
  }

  async spawnAgent(agentId, task, options = {}) {
    const agent = this.config.agents.find(a => a.id === agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    if (!agent.enabled) {
      console.warn(`Agent ${agentId} is disabled, falling back to default`);
      return this.spawnAgent(this.config.routing.default, task, options);
    }

    console.log(`🤖 Spawning ${agent.name} for task...`);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // Spawn child process
      const child = spawn('node', [path.join(__dirname, 'agent-runner.js')], {
        env: {
          ...process.env,
          AGENT_ID: agentId,
          AGENT_MODEL: agent.model,
          AGENT_PROVIDER: agent.provider,
          TASK: JSON.stringify(task),
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data); // Stream to console
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
        process.stderr.write(data);
      });

      child.on('message', (msg) => {
        if (msg.type === 'result') {
          const duration = Date.now() - startTime;
          resolve({
            agentId,
            agentName: agent.name,
            result: msg.result,
            duration,
            cost: this.calculateCost(agent, msg.usage),
            usage: msg.usage
          });
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Agent spawn failed: ${err.message}`));
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Agent exited with code ${code}\n${error}`));
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        reject(new Error('Agent timeout (5 min)'));
      }, options.timeout || 300000);
    });
  }

  calculateCost(agent, usage) {
    if (agent.cost === 0) return 0; // Free model
    
    const inputCost = (usage.inputTokens / 1_000_000) * agent.costPerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * (agent.costPerMillion * 5); // Approx output cost
    
    return inputCost + outputCost;
  }

  async executeTask(task, options = {}) {
    const agentId = options.agentId || this.routeTask(task);
    
    try {
      const result = await this.spawnAgent(agentId, task, options);
      return result;
    } catch (error) {
      console.error(`Agent execution failed: ${error.message}`);
      
      // Fallback to default agent if not already using it
      if (agentId !== this.config.routing.default) {
        console.log(`Falling back to ${this.config.routing.default}...`);
        return this.spawnAgent(this.config.routing.default, task, options);
      }
      
      throw error;
    }
  }
}

module.exports = NexusOrchestrator;
```

### Agent Runner (Child Process)

**File:** `lib/agent-runner.js`

```javascript
const OpenAI = require('openai');

async function runAgent() {
  const agentId = process.env.AGENT_ID;
  const model = process.env.AGENT_MODEL;
  const provider = process.env.AGENT_PROVIDER;
  const task = JSON.parse(process.env.TASK);

  console.log(`[${agentId}] Starting with model ${model}...`);

  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: getSystemPrompt(agentId)
        },
        {
          role: 'user',
          content: task
        }
      ],
      temperature: 0.7
    });

    const result = response.choices[0].message.content;
    const usage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens
    };

    // Send result via IPC
    process.send({
      type: 'result',
      result,
      usage
    });

    process.exit(0);
  } catch (error) {
    console.error(`[${agentId}] Error:`, error.message);
    process.exit(1);
  }
}

function getSystemPrompt(agentId) {
  const prompts = {
    gemini: 'You are a helpful AI assistant. Answer questions clearly and concisely.',
    mike: 'You are Mike, a code expert. Fix bugs, write code, and explain technical concepts. Be direct and practical.',
    philip: 'You are Philip, a UI/UX designer. Create wireframes, design interfaces, and provide design feedback.'
  };
  
  return prompts[agentId] || prompts.gemini;
}

runAgent();
```

### CLI Integration

**File:** `bin/cli.js` (update)

```javascript
// Add new command
program
  .command('task <message>')
  .description('Execute task with smart agent routing')
  .option('-a, --agent <id>', 'Force specific agent')
  .action(async (message, options) => {
    const orchestrator = new NexusOrchestrator();
    
    try {
      const result = await orchestrator.executeTask(message, {
        agentId: options.agent
      });
      
      console.log('\n' + '='.repeat(60));
      console.log(`Agent: ${result.agentName}`);
      console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`Cost: $${result.cost.toFixed(4)}`);
      console.log('='.repeat(60));
      console.log('\n' + result.result);
    } catch (error) {
      console.error('Task failed:', error.message);
      process.exit(1);
    }
  });
```

---

## 🧪 Tests de Validation

### Test 1: Code Bug Fix (Mike Agent)
```bash
vutler-nexus task "Fix this JavaScript bug: const x = [1,2,3]; x.foreach(i => console.log(i));"

Expected:
- Routes to Mike (keyword: "bug")
- Mike suggests: forEach (not foreach)
- Cost: ~$0.01 (Kimi K2.5)
```

### Test 2: General Question (Gemini Agent)
```bash
vutler-nexus task "What is the capital of France?"

Expected:
- Routes to Gemini (default)
- Answer: "Paris"
- Cost: $0.00 (FREE)
```

### Test 3: Explicit Agent
```bash
vutler-nexus task "Design a login page" --agent philip

Expected:
- Forces Philip (even though disabled in config → should fail gracefully)
- Fallback to Gemini
- Cost: $0.00
```

### Test 4: Error Handling
```bash
# Kill agent mid-execution
vutler-nexus task "Very long task..." &
sleep 2
kill <pid>

Expected:
- Timeout handling
- Clean exit
- Error message
```

---

## 📊 Success Criteria

Prototype réussi si:

✅ **Functional:**
- Mike agent exécute code tasks correctement
- Gemini agent répond aux general questions
- Routing keywords fonctionne
- Fallback works

✅ **Performance:**
- Task complète en <30s
- Process spawn overhead <1s
- Memory usage <200MB par agent

✅ **Cost:**
- Gemini tasks = $0.00
- Mike tasks = $0.01-0.03
- 60% tasks routed to Gemini (free)

✅ **UX:**
- CLI intuitive
- Progress visible
- Errors clairs

---

## 🗓️ Timeline

**Jour 1 (4h):**
- Morning: Architecture + config file
- Afternoon: NexusOrchestrator class + agent-runner.js

**Jour 2 (8h):**
- Morning: CLI integration + routing logic
- Afternoon: Tests + debugging

**Jour 3 (4h):**
- Morning: Error handling + edge cases
- Afternoon: Documentation + demo à Alex

**Total:** 16h sur 3 jours

---

## 🚀 Next Steps Après Validation

**Si prototype validé:**
1. Ajouter Philip agent (UI/UX)
2. Cost tracking dashboard
3. Session persistence
4. WebSocket support (live updates)
5. Integration avec Vutler cloud

**Si prototype échoue:**
- Fallback: Utiliser OpenClaw tel quel
- Nexus reste single-agent
- Multi-agent via Vutler cloud uniquement

---

## 📝 Notes

**Dépendances:**
- OpenRouter API key (déjà configuré)
- Node.js ≥16
- OpenAI SDK (compatible OpenRouter)

**Limitations prototype:**
- Pas de tool execution (file ops, etc.)
- Pas de memory persistence
- Pas de WebSocket
- 2-3 agents max

**Full version ajoutera:**
- Tool execution via MCP
- Memory system (Snipara)
- WebSocket real-time
- 10+ agents spécialisés
- BMAD workflow automation

---

**Créé:** 2026-03-01 20:53  
**Approuvé par:** Alex Lopez  
**Status:** Ready to start  
**Owner:** Jarvis (design) + Mike (implementation après bugs P2)
