SELECT
  id,
  title,
  subtitle,
  status,
  created_by_name,
  created_at,
  reveal_date,
  revealed_at
FROM app_awards_night__ceremonies
WHERE status IN ('voting', 'revealed')
ORDER BY CASE WHEN reveal_date = '' THEN 1 ELSE 0 END, reveal_date ASC, created_at DESC
LIMIT 100
