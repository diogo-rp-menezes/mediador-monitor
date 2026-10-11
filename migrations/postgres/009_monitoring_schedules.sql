ALTER TABLE monitoramentos_escritorios
  ADD COLUMN agenda_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN agenda_intervalo_minutos integer NOT NULL DEFAULT 60
    CHECK (agenda_intervalo_minutos BETWEEN 60 AND 10080);
