-- Migration: Normalize legacy agent avatar paths
-- Date: 2026-03-31
-- Reason:
--   - legacy values like /avatars/andrea.svg and /static/avatars/marcus.png
--     still exist in tenant_vutler.agents
--   - named agents now use frontend sprites: /sprites/agent-<slug>.png
--   - template slugs continue to use /static/avatars/<slug>.png

BEGIN;

WITH known_template_slugs(slug) AS (
  VALUES
    ('accounting-assistant'),
    ('appointment-scheduler'),
    ('av-engineer'),
    ('bi-agent'),
    ('competitor-monitor'),
    ('compliance-monitor'),
    ('contract-manager'),
    ('customer-success'),
    ('document-processor'),
    ('ecommerce-manager'),
    ('feedback-analyzer'),
    ('hr-assistant'),
    ('inventory-optimizer'),
    ('invoice-manager'),
    ('knowledge-base'),
    ('lead-gen'),
    ('marketing-campaign'),
    ('personal-assistant'),
    ('pricing-optimizer'),
    ('procurement'),
    ('project-coordinator'),
    ('proposal-generator'),
    ('research-analyst'),
    ('social-media-manager'),
    ('translator'),
    ('workflow-automation')
),
candidate_avatars AS (
  SELECT
    a.id,
    a.avatar,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          SPLIT_PART(a.avatar, '/', ARRAY_LENGTH(STRING_TO_ARRAY(a.avatar, '/'), 1)),
          '\.(png|svg|jpg|jpeg|webp)$',
          '',
          'i'
        ),
        '[^a-z0-9_-]+',
        '-',
        'g'
      )
    ) AS slug
  FROM tenant_vutler.agents a
  WHERE a.avatar IS NOT NULL
    AND BTRIM(a.avatar) <> ''
    AND (
      a.avatar LIKE '/avatars/%'
      OR a.avatar LIKE '/static/avatars/%'
      OR a.avatar ~* '^[a-z0-9_-]+(\.(png|svg|jpg|jpeg|webp))?$'
    )
),
resolved_avatars AS (
  SELECT
    c.id,
    CASE
      WHEN c.slug = '' THEN c.avatar
      WHEN EXISTS (SELECT 1 FROM known_template_slugs k WHERE k.slug = c.slug)
        THEN '/static/avatars/' || c.slug || '.png'
      ELSE '/sprites/agent-' || c.slug || '.png'
    END AS normalized_avatar
  FROM candidate_avatars c
)
UPDATE tenant_vutler.agents a
SET avatar = r.normalized_avatar,
    updated_at = NOW()
FROM resolved_avatars r
WHERE a.id = r.id
  AND a.avatar IS DISTINCT FROM r.normalized_avatar;

-- Verification query:
-- SELECT name, username, avatar FROM tenant_vutler.agents ORDER BY name;

COMMIT;
