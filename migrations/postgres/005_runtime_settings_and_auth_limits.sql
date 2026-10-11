CREATE TABLE limites_autenticacao (
  chave text PRIMARY KEY,
  janela_em bigint NOT NULL,
  contador integer NOT NULL CHECK (contador >= 0)
);

CREATE INDEX limites_autenticacao_janela_idx ON limites_autenticacao(janela_em);

CREATE TABLE ajustes_plataforma (
  chave text PRIMARY KEY,
  valor_json jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
