ALTER TABLE monitoramentos_escritorios
  ADD COLUMN agenda_semanal_json jsonb;

ALTER TABLE monitoramentos_escritorios
  ADD CONSTRAINT agenda_semanal_objeto CHECK
    (agenda_semanal_json IS NULL OR jsonb_typeof(agenda_semanal_json)='object');
