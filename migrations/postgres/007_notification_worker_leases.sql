ALTER TABLE notificacoes_publicacoes ADD COLUMN iniciado_em timestamptz;
CREATE INDEX notificacoes_worker_lease_idx ON notificacoes_publicacoes(escritorio_id,estado,iniciado_em,id);
