-- Retention keys on the ceremony, not the ballot: expiring ballots directly
-- would gut a ceremony that is still open for voting. Cascading from the
-- parent retires a whole finished awards night at once (categories and
-- ballots follow via retain_days.dependent_tables).
CREATE INDEX IF NOT EXISTS app_awards_night__ceremonies_retention_idx
  ON app_awards_night__ceremonies (created_at);
