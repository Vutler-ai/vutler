#!/usr/bin/env python3
import re

# Read the file
with open('/tmp/agentRuntime.js', 'r') as f:
    content = f.read()

# 1. Add agentCredentials to constructor
content = re.sub(
    r'(this\.rcUserId = RC_ADMIN_USER_ID;)',
    r'\1\n\n    // Agent RC credentials map (S9.2)\n    this.agentCredentials = new Map(); // agentId -> {authToken, userId}',
    content
)

# 2. Update _loadAssignments method to include RC login
new_load_assignments = '''  async _loadAssignments() {
    const pg = pool();
    const { rows } = await pg.query(
      `SELECT agent_id, rc_channel_id, rc_channel_name
         FROM agent_rc_channels WHERE is_active = TRUE`
    );

    this.channelToAgents.clear();
    this.agentMeta.clear();

    const agentIds = [...new Set(rows.map(r => r.agent_id))];

    for (const row of rows) {
      if (!this.channelToAgents.has(row.rc_channel_id)) {
        this.channelToAgents.set(row.rc_channel_id, []);
      }
      this.channelToAgents.get(row.rc_channel_id).push(row.agent_id);
    }

    for (const agentId of agentIds) {
      const agent = await this.db.collection('users').findOne({ _id: agentId });
      if (agent) {
        this.agentMeta.set(agentId, {
          name        : agent.name || agentId,
          username    : agent.username || agentId, // Store username for RC login
          systemPrompt: agent.bio
            ? `You are ${agent.name}. ${agent.bio}`
            : `You are ${agent.name || 'an AI assistant'}. Be concise and helpful.`,
        });
        
        // Login this agent to RC (S9.2)
        await this._loginAgentRC(agentId, agent.username || agentId);
      }
    }

    console.log(`[Runtime] Loaded ${rows.length} channel assignments for ${agentIds.length} agents.`);
  }'''

content = re.sub(
    r'  async _loadAssignments\(\) \{.*?\n  \}',
    new_load_assignments,
    content,
    flags=re.DOTALL
)

# 3. Add _loginAgentRC method after _loadAssignments
login_method = '''
  // ─── Agent RC Login (S9.2) ─────────────────────────────────────────────────

  async _loginAgentRC(agentId, username) {
    try {
      // Generate a deterministic password for the agent based on username
      // In production, you might want to use actual passwords from the users collection
      const crypto = require('crypto');
      const password = `agent_${username}_2026`; // Simple pattern for MVP
      const digest = crypto.createHash('sha256').update(password).digest('hex');

      const res = await fetch(RC_API_URL + '/api/v1/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          user: username, 
          password: {digest, algorithm: 'sha-256'}
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        this.agentCredentials.set(agentId, {
          authToken: data.data.authToken,
          userId: data.data.userId
        });
        console.log(`[Runtime] Agent ${username} logged in to RC`);
      } else {
        console.warn(`[Runtime] Agent ${username} RC login failed:`, data.message || 'Unknown error');
        // Fallback to admin credentials for this agent
        this.agentCredentials.set(agentId, {
          authToken: this.rcAuthToken || RC_ADMIN_TOKEN,
          userId: this.rcUserId || RC_ADMIN_USER_ID
        });
      }
    } catch (e) {
      console.error(`[Runtime] Agent ${username} RC login error:`, e.message);
      // Fallback to admin credentials
      this.agentCredentials.set(agentId, {
        authToken: this.rcAuthToken || RC_ADMIN_TOKEN,
        userId: this.rcUserId || RC_ADMIN_USER_ID
      });
    }
  }
'''

content = re.sub(
    r'(\n  \})\n(  // ─── WebSocket / DDP)',
    r'\1' + login_method + r'\n\2',
    content
)

# 4. Update _postToRC method to use agent credentials
new_post_to_rc = '''  async _postToRC(channelId, agentId, text) {
    const credentials = this.agentCredentials.get(agentId) || {
      authToken: this.rcAuthToken || RC_ADMIN_TOKEN,
      userId: this.rcUserId || RC_ADMIN_USER_ID
    };

    const res = await fetch(`${RC_API_URL}/api/v1/chat.postMessage`, {
      method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': credentials.authToken,
        'X-User-Id'   : credentials.userId,
      },
      body: JSON.stringify({ roomId: channelId, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`RC postMessage failed (${res.status}): ${body}`);
    }
    return (await res.json()).message?._id;
  }'''

content = re.sub(
    r'  async _postToRC\(channelId, agentName, text\) \{.*?\n  \}',
    new_post_to_rc,
    content,
    flags=re.DOTALL
)

# 5. Update call sites to pass agentId instead of agentName
content = re.sub(
    r'await this\._postToRC\(channelId, meta\.name, reply\);',
    r'await this._postToRC(channelId, agentId, reply);',
    content
)

content = re.sub(
    r'await this\._postToRC\(channelId, meta\.name,',
    r'await this._postToRC(channelId, agentId,',
    content
)

# Write the updated content
with open('/tmp/agentRuntime.js', 'w') as f:
    f.write(content)

print("S9.2 updates applied successfully!")