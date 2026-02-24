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