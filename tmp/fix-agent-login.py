with open('/tmp/agentRuntime.js', 'r') as f:
    code = f.read()

# Fix 1: token → authToken
code = code.replace(
    'this.agentCredentials.set(agentId, {token: data.data.authToken, userId: data.data.userId});',
    'this.agentCredentials.set(agentId, {authToken: data.data.authToken, userId: data.data.userId});'
)

# Fix 2: Use agent password
code = code.replace(
    "body: JSON.stringify({user: username, password: process.env.RC_ADMIN_PASSWORD || ''}),",
    "body: JSON.stringify({user: username, password: process.env.RC_AGENT_PASSWORD || 'StarboxAgent2026!'}),",
)

with open('/tmp/agentRuntime.js', 'w') as f:
    f.write(code)

print('Patched OK')
