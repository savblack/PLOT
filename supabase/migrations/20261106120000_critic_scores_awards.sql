-- OMDb's Awards text for a title (e.g. 'Won 4 Oscars. 159 wins & 220
-- nominations total'), cached beside the critic score. The critic-score Edge
-- Function already fetches the full OMDb record; this keeps the part it used
-- to drop. Null when OMDb has none ('N/A') or the row predates this column:
-- existing rows fill in as their 30-day cache expires, so this adds no OMDb
-- calls. Additive and nullable; the table's public select policy covers it.

alter table critic_scores add column if not exists awards text;
