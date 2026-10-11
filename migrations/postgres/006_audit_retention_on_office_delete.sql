ALTER TABLE auditoria_clientes
  ALTER COLUMN escritorio_id DROP NOT NULL;

ALTER TABLE auditoria_clientes
  DROP CONSTRAINT auditoria_clientes_escritorio_id_fkey;

ALTER TABLE auditoria_clientes
  ADD CONSTRAINT auditoria_clientes_escritorio_id_fkey
  FOREIGN KEY (escritorio_id) REFERENCES escritorios(id) ON DELETE SET NULL;
