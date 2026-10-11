/** Erro de domínio HTTP, independente do mecanismo de persistência. */
export class ErroCadastro extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
