CREATE TABLE limites_monitoramento_escritorio (
  escritorio_id integer PRIMARY KEY REFERENCES escritorios(id) ON DELETE RESTRICT,
  monitor_limite_hora integer CHECK (monitor_limite_hora BETWEEN 1 AND 1000),
  monitor_duracao_segundos integer CHECK (monitor_duracao_segundos BETWEEN 10 AND 3600),
  monitor_volume_mib integer CHECK (monitor_volume_mib BETWEEN 1 AND 1024)
);
ALTER TABLE limites_monitoramento_escritorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE limites_monitoramento_escritorio FORCE ROW LEVEL SECURITY;
CREATE POLICY contexto_escritorio ON limites_monitoramento_escritorio
  USING (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global())
  WITH CHECK (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global());
