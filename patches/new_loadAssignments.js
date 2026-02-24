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
        
        // Login this agent to RC (S9.2)
        await this._loginAgentRC(agentId, agent.username || agentId);
      }
    }

    console.log(`[Runtime] Loaded ${rows.length} channel assignments for ${agentIds.length} agents.`);
  }