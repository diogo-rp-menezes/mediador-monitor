CREATE FUNCTION impedir_mutacao_auditoria_seguranca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Auditoria de segurança é imutável' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER auditoria_seguranca_imutavel
  BEFORE UPDATE OR DELETE ON auditoria_seguranca
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_auditoria_seguranca();

CREATE TRIGGER auditoria_seguranca_sem_truncate
  BEFORE TRUNCATE ON auditoria_seguranca
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria_seguranca();
