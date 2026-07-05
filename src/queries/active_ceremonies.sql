SELECT
  id,
  title,
  subtitle,
  status,
  created_by_name,
  created_at,
  revealed_at
FROM app_awards_night__ceremonies
WHERE status IN ('voting', 'revealed')
ORDER BY created_at DESC
LIMIT 100
