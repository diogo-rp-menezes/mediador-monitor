import {expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {aprovarEnvioPostgres} from '../src/postgres-fila-envios.js';
import {hashBytes} from '../src/relatorios.js';

vi.mock('../src/postgres-consolidacao.js',()=>({prepararRelatorioPublicacaoPostgres:vi.fn(async()=>({relatorio:{versao:'v1',tipo:'CCT'}}))}));
vi.mock('../src/postgres-documentos.js',()=>({listarDocumentosClientePostgres:vi.fn(async()=>[{numero_registro:'DOC-1',status:'confirmado',desatualizado:false}])}));

it.each(['valido','corrompido','destinatario','preferencia','versao'])('aprovação verifica cenário %s antes de liberar a fila',async(scenario)=>{
  const dir=mkdtempSync(join(process.cwd(),'data','pg-approval-'));
  try{
    const path=join(dir,'analise.pdf'),bytes=Buffer.from('%PDF-1.7 fixture');
    writeFileSync(path,scenario==='corrompido'?Buffer.from('alterado'):bytes);
    const snapshot={para:'destino@example.test',contato:'Contato',cliente:'Cliente',cnpj:'11222333000181',assunto:'Documento',texto:'Texto',html:'<p>Texto</p>',versao:'v1',anexos:[{nome:'analise.pdf',path,hash:hashBytes(bytes),bytes:bytes.length}]};
    const row={id:19,cliente_id:7,contato_id:8,numero_registro:'DOC-1',versao:scenario==='versao'?'v0':'v1',envio_status:'revisao',snapshot_json:snapshot,cliente_ativo:true,modo_envio:'revisao',cnpj:snapshot.cnpj,razao_social:snapshot.cliente,contato_ativo:true,email:scenario==='destinatario'?'outro@example.test':snapshot.para,nome:snapshot.contato,receber_email:true,tipos_json:scenario==='preferencia'?['ACT']:[],documento_status:'confirmado',contexto_hash:'hash',incluir_envio:true};
    const query=vi.fn(async(sql:string)=>{
      if(sql.startsWith('SELECT cliente_id,'))return {rows:[{cliente_id:7,numero_registro:'DOC-1'}],rowCount:1};
      if(sql.startsWith('SELECT e.id,'))return {rows:[row],rowCount:1};
      return {rows:[],rowCount:1};
    });
    const client={query,release:vi.fn()},pool={connect:vi.fn(async()=>client)} as unknown as Pool;
    const result=aprovarEnvioPostgres(pool,3,19,'Administrador',hashBytes(JSON.stringify(snapshot)));
    if(scenario==='valido'){
      await expect(result).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledWith(expect.stringContaining("status='na_fila'"),expect.any(Array));
    }else{
      await expect(result).rejects.toMatchObject({status:409});
      expect(query.mock.calls.some(([sql])=>sql.includes("status='na_fila'"))).toBe(false);
      expect(query).toHaveBeenCalledWith('ROLLBACK');
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
