with open('/tmp/agentRuntime.js', 'r') as f:
    code = f.read()

# Add delay between agent logins to avoid rate limit
old = """        await this._loginAgentRC(agentId, agent.username || agentId);"""
new = """        await this._loginAgentRC(agentId, agent.username || agentId);
        // Stagger logins to avoid RC rate limit
        await new Promise(r => setTimeout(r, 2000));"""
code = code.replace(old, new)

with open('/tmp/agentRuntime.js', 'w') as f:
    f.write(code)

print('Patched: added 2s delay between agent logins')
