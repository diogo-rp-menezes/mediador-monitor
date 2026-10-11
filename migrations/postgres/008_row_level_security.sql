-- RLS is enabled as defense in depth. Runtime queries must set app.escritorio_id
-- transaction-locally before accessing office-owned rows; an absent setting denies.
CREATE FUNCTION mediador_contexto_escritorio() RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.escritorio_id', true), '')::integer
$$;
CREATE FUNCTION mediador_contexto_global() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT current_setting('app.global_access', true) = 'true'
$$;

DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'clientes','contatos','usuarios_escritorios','usuarios_clientes','clientes_contatos',
    'monitoramentos_escritorios','execucoes_escritorio','vinculos_escritorio',
    'interpretacoes_escritorio','versoes_interpretacao','historico_interpretacoes_legado',
    'publicacoes_documentos','auditoria_acessos_publicacoes','notificacoes_publicacoes',
    'clientes_documentos','auditoria_clientes','envios_clientes','tentativas_envio',
    'configuracoes_smtp_escritorio'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('CREATE POLICY contexto_escritorio ON %I USING (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global()) WITH CHECK (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global())', tabela);
  END LOOP;
END $$;

ALTER TABLE auditoria_seguranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_seguranca FORCE ROW LEVEL SECURITY;
CREATE POLICY contexto_escritorio_auditoria ON auditoria_seguranca
  USING (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global())
  WITH CHECK (escritorio_id = mediador_contexto_escritorio() OR mediador_contexto_global());
