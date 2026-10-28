-- Rebuild quota_data's token_used, cache_read_tokens and cache_creation_tokens
-- from the consume logs, in the form the server now writes: token_used is
-- uncached input plus output, and the cache columns hold the rest.
--
-- PostgreSQL, with the logs in the main database. Run it after the server that
-- writes this form has served for two full hours; it then rewrites only hours
-- that both have ended and were flushed, so running it again changes nothing.
-- Hours whose logs were deleted are left as they are.
--
-- A key that two nodes both wrote in one hour (a host move) is split between
-- their rows by request count.

CREATE TEMP TABLE quota_data_from_logs ON COMMIT DROP AS
SELECT l.user_id,
       l.model_name,
       l.created_at - l.created_at % 3600 AS created_at,
       coalesce(l."group", '') AS use_group,
       coalesce(l.token_id, 0) AS token_id,
       coalesce(l.channel_id, 0) AS channel_id,
       sum(CASE
               -- Anthropic usage, including Claude usage converted to OpenAI
               -- shape without a semantic tag, reports input without the cache.
               WHEN o.doc ->> 'usage_semantic' = 'anthropic'
                   OR coalesce((o.doc ->> 'cache_creation_tokens_5m')::bigint, 0) > 0
                   OR coalesce((o.doc ->> 'cache_creation_tokens_1h')::bigint, 0) > 0
                   THEN l.prompt_tokens
               ELSE greatest(l.prompt_tokens - c.read_tokens - c.write_tokens, 0)
           END + l.completion_tokens) AS token_used,
       sum(c.read_tokens) AS cache_read_tokens,
       sum(c.write_tokens) AS cache_creation_tokens
FROM logs l
CROSS JOIN LATERAL (SELECT nullif(l.other, '')::jsonb AS doc) o
CROSS JOIN LATERAL (SELECT coalesce((o.doc ->> 'cache_tokens')::bigint, 0) AS read_tokens,
                           coalesce((o.doc ->> 'cache_write_tokens')::bigint, 0) AS write_tokens) c
WHERE l.type = 2
  AND l.created_at < extract(epoch FROM now())::bigint / 3600 * 3600 - 3600
GROUP BY 1, 2, 3, 4, 5, 6;

WITH share AS (
    SELECT id,
           count::numeric / nullif(sum(count) OVER (
               PARTITION BY user_id, model_name, created_at, use_group, token_id, channel_id), 0) AS part
    FROM quota_data
    WHERE created_at < extract(epoch FROM now())::bigint / 3600 * 3600 - 3600
)
UPDATE quota_data q
SET token_used            = round(l.token_used * s.part),
    cache_read_tokens     = round(l.cache_read_tokens * s.part),
    cache_creation_tokens = round(l.cache_creation_tokens * s.part)
FROM share s, quota_data_from_logs l
WHERE q.id = s.id
  AND s.part IS NOT NULL
  AND l.user_id = q.user_id
  AND l.model_name = q.model_name
  AND l.created_at = q.created_at
  AND l.use_group = q.use_group
  AND l.token_id = q.token_id
  AND l.channel_id = q.channel_id;
