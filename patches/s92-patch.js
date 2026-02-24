// ===== PATCH FOR S9.2 =====
// This file contains the changes needed for S9.2 - Agent posts as own RC user

// 1. Add to constructor (after this.rcUserId = RC_ADMIN_USER_ID;)
// Add agent credentials map
this.agentCredentials = new Map(); // agentId -> {authToken, userId}

// 2. Replace _loadAssignments method to also login agent users
async _loadAssignments() {
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
      
      // Login this agent to RC
      await this._loginAgentRC(agentId, agent.username || agentId);
    }
  }

  console.log(`[Runtime] Loaded ${rows.length} channel assignments for ${agentIds.length} agents.`);
}

// 3. Add new method to login individual agents
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

// 4. Replace _postToRC method to use agent credentials
async _postToRC(channelId, agentId, text) {
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
}

// 5. Update call sites to pass agentId instead of agentName
// In _handleForAgent method, change:
// await this._postToRC(channelId, meta.name, reply);
// TO:
// await this._postToRC(channelId, agentId, reply);

// AND change:
// await this._postToRC(channelId, meta.name,
// TO:
// await this._postToRC(channelId, agentId,