c = open("/home/ubuntu/vutler/app/custom/services/llmRouter.js").read()

# After getting apiKey from config, fallback to env var if null
old = """const apiKey = cfg.api_key_encrypted ? decryptField(cfg.api_key_encrypted) : null;
    return {
      provider:       cfg.provider,
      apiKey,"""

new = """const apiKey = cfg.api_key_encrypted ? decryptField(cfg.api_key_encrypted) : null;
    // Fallback to environment variable if no per-agent key
    const envKeyMap = {anthropic:'ANTHROPIC_API_KEY', openai:'OPENAI_API_KEY', minimax:'MINIMAX_API_KEY', google:'GOOGLE_API_KEY', groq:'GROQ_API_KEY'};
    const finalKey = apiKey || process.env[envKeyMap[cfg.provider]] || null;
    return {
      provider:       cfg.provider,
      apiKey: finalKey,"""

if old in c:
    c = c.replace(old, new)
    print("Fixed API key fallback to env var")
else:
    print("Pattern not found")

open("/home/ubuntu/vutler/app/custom/services/llmRouter.js", "w").write(c)
