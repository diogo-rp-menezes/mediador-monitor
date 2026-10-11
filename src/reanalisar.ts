import { existsSync } from "node:fs";
import { atualizarArquivoEExtracao, iniciarAnalise, falharAnalise, lerLlm, type Db } from "./db.js";
import { lerDocumento } from "./documento.js";
import { extrairClausulas } from "./extract.js";
import { extrairAlteracoesAditivo } from './consolidacao.js';
import { ehAditivoCct } from './vinculos.js';
import type { Extracao } from "./types.js";

/** Refaz a análise por IA a partir do documento já baixado (sem acessar o portal). */
export async function reanalisar(db: Db, numero: string): Promise<Extracao> {
  const row = db.prepare("SELECT arquivo_path, vigencia, tipo FROM registros WHERE numero_registro = ?").get(numero) as
    | { arquivo_path: string | null; vigencia: string | null; tipo:string } | undefined;
  if (!row) throw new Error("Registro não encontrado.");
  if (!iniciarAnalise(db, numero)) throw new Error("Já existe uma análise em andamento para este registro.");
  try {
    if (!row.arquivo_path || !existsSync(row.arquivo_path))
      throw new Error("O documento deste registro não foi baixado (ou foi removido). Baixe-o de novo pelo modo assistido.");
    const llm = lerLlm(db);
    if (!llm.ativo) throw new Error("Ative e configure o LLM em Configurações.");
    const texto=await lerDocumento(row.arquivo_path);
    const ext:Extracao|null=ehAditivoCct(row.tipo)
      ? {topicos:{},aditivo:{versao:'1.0',alteracoes:await extrairAlteracoesAditivo(texto,llm)}}
      : await extrairClausulas(texto,llm,{vigencia:row.vigencia??undefined});
    if (!ext) throw new Error("O LLM não retornou análise.");
    atualizarArquivoEExtracao(db, numero, row.arquivo_path, ext);
    return ext;
  } catch (e) {
    falharAnalise(db, numero, (e as Error).message);
    throw e;
  }
}
