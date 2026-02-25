c = open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js").read()

# Add a login-at-startup that gets a REST auth token
old_constructor = "this.llmRouter = new LLMRouter(null, {});"
new_constructor = """this.llmRouter = new LLMRouter(null, {});
    this.rcAuthToken = null;
    this.rcUserId = RC_ADMIN_USER_ID;"""

if "this.rcAuthToken" not in c:
    c = c.replace(old_constructor, new_constructor)

# Add login method to get REST token
login_method = """
  async _loginREST() {
    try {
      const res = await fetch(RC_API_URL + '/api/v1/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user: process.env.RC_ADMIN_USERNAME, password: process.env.RC_ADMIN_PASSWORD}),
      });
      const data = await res.json();
      if (data.status === 'success') {
        this.rcAuthToken = data.data.authToken;
        this.rcUserId = data.data.userId;
        console.log('[Runtime] REST API login OK');
      } else {
        console.error('[Runtime] REST API login failed:', data);
      }
    } catch (e) {
      console.error('[Runtime] REST login error:', e.message);
    }
  }
"""

if "_loginREST" not in c:
    # Insert before _postToRC
    c = c.replace("async _postToRC(", login_method + "\n  async _postToRC(")

# Call _loginREST after DDP login success
old_login_ok = "console.log('[Runtime] RC login OK — subscribing to channels…');"
new_login_ok = "console.log('[Runtime] RC login OK — subscribing to channels…');\n            await this._loginREST();"
if "_loginREST();" not in c:
    c = c.replace(old_login_ok, new_login_ok)

# Use this.rcAuthToken in _postToRC
c = c.replace("'X-Auth-Token': RC_ADMIN_TOKEN,", "'X-Auth-Token': this.rcAuthToken || RC_ADMIN_TOKEN,")
c = c.replace("'X-User-Id'   : RC_ADMIN_USER_ID,", "'X-User-Id'   : this.rcUserId || RC_ADMIN_USER_ID,")

open("/home/ubuntu/vutler/app/custom/services/agentRuntime.js", "w").write(c)
print("Fixed REST auth")
