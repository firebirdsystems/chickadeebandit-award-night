SELECT
  id,
  ceremony_id,
  title,
  description,
  nominee_type,
  sort_order,
  created_at
FROM app_awards_night__categories
ORDER BY ceremony_id, sort_order, created_at
LIMIT 500
