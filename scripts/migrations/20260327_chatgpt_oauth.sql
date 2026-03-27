-- ChatGPT OAuth / Codex provider integration
-- Adds ChatGPT to the integrations catalog so agents can use ChatGPT subscriptions via OAuth PKCE

INSERT INTO tenant_vutler.integrations_catalog
  (provider, name, description, icon, category, source, actions, default_scopes, is_enabled)
VALUES
  ('chatgpt', 'ChatGPT', 'Use your ChatGPT subscription to power agents with GPT-4o, o3, and Codex models', '🤖', 'ai', 'internal',
   '["llm_chat","code_generation"]'::jsonb, '["model.request.all"]'::jsonb, TRUE)
ON CONFLICT (provider) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  actions = EXCLUDED.actions,
  default_scopes = EXCLUDED.default_scopes,
  updated_at = NOW();
