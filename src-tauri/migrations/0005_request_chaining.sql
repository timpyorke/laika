-- Phase 8: response-to-variable extraction for request chaining.

ALTER TABLE saved_request ADD COLUMN extractions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE test_case_result ADD COLUMN extraction_results_json TEXT NOT NULL DEFAULT '[]';
