-- Starter BigQuery queries over the tables loaded from data/processed (dataset: fundtrace).
-- Results are investigative leads; always show evidence_status and source links.

-- 1. Entity profile: every proceeding naming a company, newest first.
SELECT e.canonical_name, ev.publication_date, ev.source_id, ev.case_type,
       ev.proceeding_status, r.evidence_status, ev.appeal_status, d.url
FROM fundtrace.entities e
JOIN fundtrace.relationships r ON r.from_id = e.entity_id AND r.relationship_type = 'NAMED_IN_PROCEEDING'
JOIN fundtrace.case_events ev ON ev.event_id = r.to_id
JOIN fundtrace.documents d ON d.document_id = ev.document_id
WHERE e.canonical_name LIKE '%Coffee Day%'
ORDER BY ev.publication_date DESC;

-- 2. Two-hop network: entities linked to a seed entity through a shared proceeding,
--    shared registered address, insolvency applicant, auditor or IP (recursive CTE).
WITH RECURSIVE edges AS (
  SELECT from_id AS a, to_id AS b, relationship_type, evidence_status, document_id
  FROM fundtrace.relationships
  WHERE relationship_type IN ('NAMED_IN_PROCEEDING', 'REGISTERED_AT', 'INSOLVENCY_APPLICANT_AGAINST',
                              'AUDITOR_OF', 'INSOLVENCY_PROFESSIONAL_FOR')
  UNION ALL
  SELECT to_id, from_id, relationship_type, evidence_status, document_id
  FROM fundtrace.relationships
  WHERE relationship_type IN ('NAMED_IN_PROCEEDING', 'REGISTERED_AT', 'INSOLVENCY_APPLICANT_AGAINST',
                              'AUDITOR_OF', 'INSOLVENCY_PROFESSIONAL_FOR')
),
walk AS (
  SELECT e.entity_id AS node, 0 AS depth, [e.entity_id] AS path
  FROM fundtrace.entities e WHERE e.canonical_name LIKE '%Religare Finvest%'
  UNION ALL
  SELECT ed.b, w.depth + 1, ARRAY_CONCAT(w.path, [ed.b])
  FROM walk w JOIN edges ed ON ed.a = w.node
  WHERE w.depth < 4 AND ed.b NOT IN UNNEST(w.path)   -- entity → event/address → entity → …
)
SELECT DISTINCT en.canonical_name, w.depth, w.path
FROM walk w JOIN fundtrace.entities en ON en.entity_id = w.node
WHERE w.depth BETWEEN 2 AND 4
ORDER BY w.depth;

-- 3. Review queue: entities with the most distinct risk-signal types.
SELECT e.canonical_name, e.cin, COUNT(DISTINCT s.signal_type) AS signal_types,
       ARRAY_AGG(STRUCT(s.signal_type, s.value, s.explanation)) AS signals
FROM fundtrace.risk_signals s JOIN fundtrace.entities e ON e.entity_id = s.subject_id
GROUP BY 1, 2
ORDER BY signal_types DESC, e.canonical_name
LIMIT 100;

-- 4. Backtest helper (brief step 11): what was public about a case before a cutoff date.
SELECT cd.case_id, cd.publication_date, cd.source_id, ev.case_type, ev.title
FROM fundtrace.case_documents cd
JOIN fundtrace.case_events ev ON ev.document_id = cd.document_id
WHERE cd.case_id = 'dhfl' AND cd.publication_date < DATE '2019-06-01'  -- cutoff
ORDER BY cd.publication_date;
