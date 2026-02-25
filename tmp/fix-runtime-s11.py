c = open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js").read()

# Add _loginAgentRC stub if not defined as a method
if "async _loginAgentRC" not in c:
    # Add before _postToRC
    stub = """
  async _loginAgentRC(agentId, username) {
    try {
      const res = await fetch(RC_API_URL + '/api/v1/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user: username, password: process.env.RC_ADMIN_PASSWORD || ''}),
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (!this.agentCredentials) this.agentCredentials = new Map();
        this.agentCredentials.set(agentId, {token: data.data.authToken, userId: data.data.userId});
        console.log('[Runtime] Agent ' + username + ' RC login OK');
      }
    } catch (e) {
      console.log('[Runtime] Agent ' + username + ' RC login skipped:', e.message);
    }
  }
"""
    c = c.replace("  async _postToRC(", stub + "\n  async _postToRC(")
    print("Added _loginAgentRC stub")
else:
    print("_loginAgentRC already exists")

open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js", "w").write(c)
print("Saved")
