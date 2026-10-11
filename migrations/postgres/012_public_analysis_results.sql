-- Preserve each successful extraction alongside its immutable attempt.
ALTER TABLE tentativas_analise ADD COLUMN extracao_json jsonb;
ALTER TABLE tentativas_analise ADD CONSTRAINT tentativa_resultado_status
  CHECK ((status='concluida' AND extracao_json IS NOT NULL)
      OR (status<>'concluida' AND extracao_json IS NULL));
