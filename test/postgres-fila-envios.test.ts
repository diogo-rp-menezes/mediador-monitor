import {expect,it,vi} from 'vitest';
vi.mock('../src/postgres-backup-gate.js',()=>({comEscritorArquivosPostgres:async(_pool:unknown,work:(signal:AbortSignal)=>Promise<unknown>)=>work(new AbortController().signal)}));
import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {concluirEnvioPostgres,falharEnvioPostgres,fingerprintContextoEnvioPostgres,processarFilaPostgres,reservarEnviosPostgres,recuperarEnviosPresosPostgres} from '../src/postgres-fila-envios.js';
import {hashBytes} from '../src/relatorios.js';
import {prepararRelatorioPublicacaoPostgres} from '../src/postgres-consolidacao.js';
import {reprepararEnvioPostgres} from '../src/postgres-fila-envios.js';
vi.mock('../src/postgres-consolidacao.js',()=>({prepararRelatorioPublicacaoPostgres:vi.fn()}));

it('repreparação devolve somente o destinatário e documento selecionados',async()=>{
  const client={query:vi.fn(async(sql:string)=>sql.startsWith('SELECT status,')?{rows:[{status:'falhou',cliente_id:7,contato_id:8,numero_registro:'DOC-1'}],rowCount:1}:{rows:[],rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(reprepararEnvioPostgres(pool,3,19,false)).resolves.toEqual({cliente_id:7,contato_id:8,numero_registro:'DOC-1'});
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status='bloqueado'"),[19,3]);
});

it('calcula a mesma aprovação para preferências em JSON textual e JSONB nativo',()=>{
  const row={cliente_id:7,cliente_ativo:true,modo_envio:'revisao',cnpj:'11222333000181',razao_social:'Cliente',contato_id:8,contato_ativo:true,email:'destino@example.test',nome:'Contato',receber_email:true,tipos_json:['CCT'],contexto_hash:'contexto',status:'confirmado'};
  expect(fingerprintContextoEnvioPostgres(row)).toBe(fingerprintContextoEnvioPostgres({...row,tipos_json:JSON.stringify(row.tipos_json)}));
  expect(()=>fingerprintContextoEnvioPostgres({...row,tipos_json:'{}'})).toThrow();
});

it('reserva só mensagens vencidas do escritório com lock concorrente skip locked',async()=>{
  const client={query:vi.fn().mockResolvedValue({rows:[{id:9,escritorio_id:3}],rowCount:1}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(reservarEnviosPostgres(pool,3,4)).resolves.toEqual([{id:9,escritorio_id:3}]);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE SKIP LOCKED'),[3,4]);
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(client.release).toHaveBeenCalled();
});

it('registra conclusão e tentativa no mesmo cliente transacional',async()=>{
  const client={query:vi.fn().mockResolvedValue({rowCount:1})} as unknown as PoolClient;
  await concluirEnvioPostgres(client,3,9,{messageId:'<abc>'});
  expect(client.query).toHaveBeenNthCalledWith(1,expect.stringContaining("status='enviado'"),['<abc>',null,9,3]);
  expect(client.query).toHaveBeenNthCalledWith(2,expect.stringContaining('INSERT INTO tentativas_envio'),[9,3,'<abc>']);
});

it('falha recuperável volta à fila e ambiguidade fica incerta',async()=>{
  const client={query:vi.fn().mockResolvedValueOnce({rows:[{tentativas:1}],rowCount:1}).mockResolvedValue({rowCount:1})} as unknown as PoolClient;
  await falharEnvioPostgres(client,3,9,{erro:'temporário'});
  expect(client.query).toHaveBeenNthCalledWith(2,expect.stringContaining('UPDATE envios_clientes'),['na_fila','temporário',30,9,3]);
  const uncertain={query:vi.fn().mockResolvedValueOnce({rows:[{tentativas:2}],rowCount:1}).mockResolvedValue({rowCount:1})} as unknown as PoolClient;
  await falharEnvioPostgres(uncertain,3,10,{erro:'timeout SMTP',incerto:true});
  expect(uncertain.query).toHaveBeenNthCalledWith(2,expect.stringContaining('UPDATE envios_clientes'),['incerto','timeout SMTP',60,10,3]);
});

it('recupera job preso marcando como incerto, sem reenvio automático',async()=>{
  const client={query:vi.fn(async(sql:string)=>sql.includes('SELECT id FROM envios_clientes')?{rows:[{id:9}],rowCount:1}:{rowCount:1,rows:[]}),release:vi.fn()};
  const pool={connect:vi.fn().mockResolvedValue(client)} as unknown as Pool;
  await expect(recuperarEnviosPresosPostgres(pool,3)).resolves.toBe(1);
  expect(client.query).toHaveBeenNthCalledWith(4,expect.stringContaining('FOR UPDATE SKIP LOCKED'),[3,900]);
  expect(client.query).toHaveBeenNthCalledWith(5,expect.stringContaining("status='incerto'"),[9,3]);
  expect(client.query).toHaveBeenNthCalledWith(6,expect.stringContaining('INSERT INTO tentativas_envio'),[9,3]);
});

it.each(['v1','v2'])('worker confere versão atual %s antes de transmitir snapshot aprovado',async(version)=>{
  vi.mocked(prepararRelatorioPublicacaoPostgres).mockResolvedValue({relatorio:{versao:version}} as never);
  const dir=mkdtempSync(join(process.cwd(),'data','pg-worker-'));
  try{
    const file=join(dir,'relatorio.pdf'),bytes=Buffer.from('%PDF-1.7\nfixture');writeFileSync(file,bytes);
    const snapshot={para:'destino@example.test',contato:'Contato',cliente:'Cliente',cnpj:'11222333000181',assunto:'Documento',texto:'Texto',html:'<p>Texto</p>',versao:'v1',anexos:[{nome:'relatorio.pdf',path:file,hash:hashBytes(bytes),bytes:bytes.length}]};
    const contextHash=hashBytes(JSON.stringify({cliente:{cnpj:snapshot.cnpj,uf:'DF',municipio:'Brasília'},doc:{arquivo_hash:'file-hash',documento_meta_json:{},tipo:'Acordo',vigencia:''},vinculos:[]}));
    const row={cliente_id:7,cliente_ativo:true,modo_envio:'revisao',cnpj:snapshot.cnpj,razao_social:'Cliente',contato_id:8,contato_ativo:true,email:snapshot.para,nome:'Contato',receber_email:true,tipos_json:'[]',contexto_hash:contextHash,status:'confirmado'};
    const approval=fingerprintContextoEnvioPostgres(row);
    const reservation={query:vi.fn(async(sql:string)=>sql.includes('WITH selecionados')?{rows:[{id:19,escritorio_id:3,cliente_id:7,contato_id:8,numero_registro:'DOC-1',versao:'v1',snapshot_json:snapshot,tentativas:1}],rowCount:1}:{rowCount:1,rows:[]}),release:vi.fn()};
    const detailClient={query:vi.fn().mockResolvedValue({rows:[{...row,incluir_envio:true,aprovado_por:'Admin',aprovado_em:new Date(),contexto_aprovacao:approval,message_id:null,snapshot_json:snapshot,tipo:'Acordo',analise_status:'analisado'}],rowCount:1}),release:vi.fn()};
    const docsClient={query:vi.fn(async(sql:string)=>{
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('set_config'))return{rowCount:null};
      if(sql.includes('SELECT id FROM clientes'))return{rows:[{id:7}],rowCount:1};
      if(sql.includes('SELECT d.cliente_id'))return{rows:[{cliente_id:7,numero_registro:'DOC-1',status:'confirmado',motivo:'ok',contexto_hash:contextHash,origem:'manual',responsavel:'Admin',justificativa:'Conferido',atualizado_em:new Date(),incluir_envio:true,tipo:'Acordo',vigencia:'',arquivo_disponivel:true}],rowCount:1};
      if(sql.includes('SELECT cnpj,uf,municipio'))return{rows:[{cnpj:snapshot.cnpj,uf:'DF',municipio:'Brasília'}],rowCount:1};
      if(sql.includes('SELECT arquivo_hash,documento_meta_json'))return{rows:[{arquivo_hash:'file-hash',documento_meta_json:{},tipo:'Acordo',vigencia:''}],rowCount:1};
      return{rows:[],rowCount:0};
    }),release:vi.fn()};
    const smtpClient={query:vi.fn(async(sql:string)=>sql.includes('SELECT ativo')?{rows:[{ativo:true,host:'smtp.test',porta:587,secure:false,usuario:'',remetente:'envio@example.test',senha_cifrada:'',versao:1}],rowCount:1}:{rowCount:null}),release:vi.fn()};
    const finish={query:vi.fn().mockResolvedValue({rows:[{tentativas:1}],rowCount:1}),release:vi.fn()};
    const pool={connect:vi.fn().mockResolvedValueOnce(reservation).mockResolvedValueOnce(detailClient).mockResolvedValueOnce(docsClient).mockResolvedValueOnce(version==='v1'?smtpClient:finish).mockResolvedValueOnce(finish),query:vi.fn()
      .mockResolvedValueOnce({rows:[{id:7}],rowCount:1})
      .mockResolvedValueOnce({rows:[{cliente_id:7,numero_registro:'DOC-1',status:'confirmado',motivo:'ok',contexto_hash:contextHash,origem:'manual',responsavel:'Admin',justificativa:'Conferido',atualizado_em:new Date(),incluir_envio:true,tipo:'Acordo',vigencia:'',arquivo_disponivel:true}],rowCount:1})
      .mockResolvedValueOnce({rows:[{cnpj:snapshot.cnpj,uf:'DF',municipio:'Brasília'}],rowCount:1})
      .mockResolvedValueOnce({rows:[{arquivo_hash:'file-hash',documento_meta_json:{},tipo:'Acordo',vigencia:''}],rowCount:1})
      .mockResolvedValueOnce({rows:[],rowCount:0})
      .mockResolvedValueOnce({rows:[{ativo:true,host:'smtp.test',porta:587,secure:false,usuario:'',remetente:'envio@example.test',senha_cifrada:'',versao:1}],rowCount:1})} as unknown as Pool;
    const sendMail=vi.fn(async(message:Record<string,unknown>)=>{expect(message.to).toBe(snapshot.para);expect(message.attachments).toEqual([{filename:'relatorio.pdf',content:bytes}]);return {accepted:[snapshot.para],messageId:'<accepted>'};});
    const outcome=await processarFilaPostgres(pool,3,{sendMail});
    if(version!=='v1'){
      expect(sendMail).not.toHaveBeenCalled();
      expect(outcome).toEqual({enviados:0,falhas:1,ignorados:1});
      expect(finish.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE envios_clientes'),expect.arrayContaining(['O conteúdo mudou desde a aprovação. Reprepare o envio.']));
      return;
    }
    expect(sendMail).toHaveBeenCalledOnce();
    expect(outcome).toEqual({enviados:1,falhas:0,ignorados:0});expect(finish.query).toHaveBeenCalledWith(expect.stringContaining("status='enviado'"),['<accepted>','Destinatário aceito pelo servidor SMTP',19,3]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
