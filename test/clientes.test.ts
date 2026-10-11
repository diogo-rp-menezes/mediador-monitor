import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { openDb, criarSindicato, salvarArquivo, upsertRegistro, atualizarArquivoEExtracao, type Db } from '../src/db.js';
import { cnpjValido, descobrirDocumentosClientes, decidirDocumentoCliente, detalheCliente, excluirCadastro, indexarMetaDocumento, listarClientes, registrarSindicatoDocumento, salvarCliente, salvarContato } from '../src/cadastros.js';
import { aprovarEnvio, cancelarEnvio, lerEnvio, listarEnvios, prepararEnvios, processarFila, recuperarEnviosInterrompidos, reprepararEnvio, vistaEnvio } from '../src/envios.js';
import { obterRelatorio, hashBytes, renderizarRelatorioHtml } from '../src/relatorios.js';
import { salvarNotificacoes } from '../src/settings.js';
import { aplicarAlteracoes, fingerprintDocumentos } from '../src/consolidacao.js';
import { CAMPOS_CCT, NAO_CONSTA_CCT, type PadraoCct } from '../src/cct-template.js';

const ano=new Date().getUTCFullYear(), numero=`DF000001/${ano}`;
const pasta=resolve('data','clientes-test-'+randomUUID());mkdirSync(pasta,{recursive:true});
const bancos:Db[]=[];
const cliente={razao_social:'Cliente Alfa Ltda',nome_fantasia:'Alfa',cnpj:'11.222.333/0001-81',uf:'DF',municipio:'Brasília',ativo:true,modo_envio:'revisao' as const};
const sindicato={nome:'Sindicato de Comércio',cnpj:'04.252.011/0001-10',categoria:'empregados do comércio',uf:'DF',tipo:'Convenção Coletiva',vigencia:'Vigentes',titulo:'',ativo:true};
const padrao=():PadraoCct=>({versao:'1.0.0',campos:Object.fromEntries(CAMPOS_CCT.map(c=>[c.id,NAO_CONSTA_CCT])),evidencias:{}});
function setup(modo:'revisao'|'automatico'='revisao',conferido=false,analisado=true){
  const db=openDb(':memory:');bancos.push(db);
  const sid=criarSindicato(db,sindicato);
  const tid=salvarContato(db,null,{nome:'Maria RH',email:'maria@example.test',ativo:true});
  const cid=salvarCliente(db,null,{...cliente,modo_envio:modo,sindicatos:[{sindicato_id:sid,categoria:sindicato.categoria,uf:'DF',municipio:'Brasília',principal:true,enquadramento_confirmado:conferido}],contatos:[{contato_id:tid,funcao:'RH',receber_email:true,tipos:[]}]});
  const original=`CONVENÇÃO COLETIVA DE TRABALHO\nNÚMERO DE REGISTRO NO MTE: ${numero}\nCNPJ: ${sindicato.cnpj}\nCLÁUSULA PRIMEIRA - VIGÊNCIA\nAs partes fixam a vigência da presente Convenção Coletiva de Trabalho no período de 01/01/${ano} a 31/12/${ano}.\nCLÁUSULA SEGUNDA - ABRANGÊNCIA\nO presente instrumento abrangerá a(s) categoria(s) empregados do comércio, com abrangência territorial em Brasília/DF.\nCLÁUSULA TERCEIRA - PISO\nO piso é R$ 2.500,00.`;
  const path=join(pasta,randomUUID()+'.doc');writeFileSync(path,original);
  upsertRegistro(db,sindicato.nome,{numeroRegistro:numero,numeroSolicitacao:'',tipo:'Convenção Coletiva',vigencia:`01/01/${ano} - 31/12/${ano}`,partes:'Sindicato',indice:0});
  salvarArquivo(db,numero,{path,hash:hashBytes(original),bytes:Buffer.byteLength(original),original:'original.doc'});
  registrarSindicatoDocumento(db,numero,sid);indexarMetaDocumento(db,numero,original);
  const p=padrao();p.campos.s02_piso_geral='R$ 2.500,00';p.evidencias!.s02_piso_geral={clausula:'Cláusula terceira',citacao:'O piso é R$ 2.500,00.'};
  if(analisado)atualizarArquivoEExtracao(db,numero,path,{padrao:p,topicos:{}});
  salvarNotificacoes(db,{slack:{ativo:false},email:{ativo:true,host:'smtp.example.test',port:587,secure:false,user:'',from:'monitor@example.test',to:''}});
  descobrirDocumentosClientes(db);return {db,sid,tid,cid,path,original,p};
}
const pdf=async()=>Buffer.from('%PDF-1.4\nPDF simulado em teste de lógica');
async function preparar(f:ReturnType<typeof setup>,confirmar=true){
  if(confirmar)decidirDocumentoCliente(f.db,f.cid,numero,'confirmado','Diogo','Enquadramento e documento conferidos.');
  await prepararEnvios(f.db,f.cid,numero,{pdf});return listarEnvios(f.db)[0].id;
}
const aceitar=async(m:Record<string,unknown>)=>({accepted:[m.to],rejected:[],messageId:String(m.messageId),response:'250 aceito'});
afterEach(()=>{
  for(const db of bancos.splice(0)){
    const rows=db.prepare('SELECT snapshot_json FROM envios_clientes WHERE snapshot_json IS NOT NULL').all() as {snapshot_json:string}[];
    for(const r of rows){const a=JSON.parse(r.snapshot_json).anexos[0];if(a)rmSync(dirname(a.path),{recursive:true,force:true});}
    db.close();
  }
});

describe('cadastros e migração',()=>{
  it('valida os dígitos de CNPJs numéricos e alfanuméricos, sem aceitar zeros',()=>{
    expect(cnpjValido(cliente.cnpj)).toBe(true);expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12.ABC.345/01DE-36')).toBe(false);expect(cnpjValido('00000000000000')).toBe(false);
  });
  it('preserva dados de um banco antigo e reaplica a migração sem duplicar vínculos',()=>{
    const path=join(pasta,randomUUID()+'.db'),old=new Database(path);
    old.exec(`CREATE TABLE registros(numero_registro TEXT PRIMARY KEY,numero_solicitacao TEXT,watch TEXT NOT NULL,tipo TEXT,vigencia TEXT,partes TEXT,arquivo_path TEXT,extracao_json TEXT,primeira_vez TEXT DEFAULT(datetime('now')),notificado INTEGER DEFAULT 0);
      CREATE TABLE sindicatos(id INTEGER PRIMARY KEY,nome TEXT,cnpj TEXT,categoria TEXT,uf TEXT,tipo TEXT,vigencia TEXT,ativo INTEGER,criado_em TEXT DEFAULT(datetime('now')));
      INSERT INTO sindicatos VALUES(1,'Sindicato legado','','','','Convenção Coletiva','',1,datetime('now'));
      INSERT INTO registros(numero_registro,watch,tipo,extracao_json,notificado) VALUES('DF000010/2020','Sindicato legado','Convenção Coletiva','{"topicos":{}}',1);`);
    old.close();let db=openDb(path);
    expect(db.prepare('SELECT notificado,extracao_json FROM registros').get()).toEqual({notificado:1,extracao_json:'{"topicos":{}}'});
    expect(db.prepare('SELECT COUNT(*) n FROM registros_sindicatos').get()).toEqual({n:1});
    const id=salvarCliente(db,null,cliente);db.close();db=openDb(path);bancos.push(db);
    expect(detalheCliente(db,id).razao_social).toBe(cliente.razao_social);
    expect(db.prepare('SELECT COUNT(*) n FROM registros_sindicatos').get()).toEqual({n:1});
  });
  it('mantém vínculos ao editar dados, permite contato compartilhado e bloqueia duplicatas',()=>{
    const f=setup();salvarCliente(f.db,f.cid,{...cliente,nome_fantasia:'Alfa editado'});
    expect(detalheCliente(f.db,f.cid).contatos).toHaveLength(1);
    const segundo=salvarCliente(f.db,null,{...cliente,cnpj:'11.444.777/0001-61',razao_social:'Cliente Beta',contatos:[{contato_id:f.tid,receber_email:false}]});
    expect(detalheCliente(f.db,segundo).contatos[0].receber_email).toBe(false);
    expect(()=>salvarCliente(f.db,null,cliente)).toThrow(/CNPJ/);
    expect(()=>salvarContato(f.db,null,{nome:'Duplicado',email:'MARIA@example.test'})).toThrow(/e-mail/);
    expect(()=>excluirCadastro(f.db,'contatos',f.tid)).toThrow(/Inative/);
  });
  it('reverte toda a transação quando um sindicato não existe',()=>{
    const f=setup(),antes=listarClientes(f.db).length;
    expect(()=>salvarCliente(f.db,null,{...cliente,cnpj:'11.444.777/0001-61',sindicatos:[{sindicato_id:999}]})).toThrow(/encontrado/);
    expect(listarClientes(f.db)).toHaveLength(antes);
  });
  it('exclui cadastros novos sem dependências e mantém os demais',()=>{
    const f=setup(),cid=salvarCliente(f.db,null,{...cliente,cnpj:'12.ABC.345/01DE-35',razao_social:'Cadastro sem histórico'}),tid=salvarContato(f.db,null,{nome:'Contato sem vínculo',email:'livre@example.test'});
    excluirCadastro(f.db,'clientes',cid);excluirCadastro(f.db,'contatos',tid);
    expect(listarClientes(f.db).map(c=>c.id)).toEqual([f.cid]);expect(f.db.prepare('SELECT id FROM contatos WHERE id=?').get(tid)).toBeUndefined();
  });
});
describe('aplicabilidade e documentos',()=>{
  it('coincidência de sindicato não confirma documento; confirmação manual é auditada',()=>{
    const f=setup();expect(detalheCliente(f.db,f.cid).sindicatos[0].enquadramento_confirmado).toBe(false);
    expect((f.db.prepare('SELECT status FROM clientes_documentos').get() as {status:string}).status).toBe('candidato');
    decidirDocumentoCliente(f.db,f.cid,numero,'confirmado','Diogo','Conferido');
    expect(f.db.prepare("SELECT COUNT(*) n FROM auditoria_clientes WHERE acao='confirmado'").get()).toEqual({n:1});
  });
  it('confirma somente com CNPJ, categoria exata, território e vigência explícitos',()=>{
    const f=setup('automatico',true);expect((f.db.prepare('SELECT status FROM clientes_documentos').get() as {status:string}).status).toBe('confirmado');
    indexarMetaDocumento(f.db,numero,f.original.replace('Brasília/DF','Goiânia/GO'));descobrirDocumentosClientes(f.db);
    expect((f.db.prepare('SELECT status FROM clientes_documentos').get() as {status:string}).status).toBe('candidato');
  });
  it('não automatiza categorias com ressalvas ou excluídas',()=>{
    const f=setup('automatico',true);indexarMetaDocumento(f.db,numero,f.original.replace('empregados do comércio,','empregados do comércio, exceto categoria diferenciada,'));descobrirDocumentosClientes(f.db);
    expect((f.db.prepare('SELECT status FROM clientes_documentos').get() as {status:string}).status).toBe('candidato');
  });
  it('não inclui documentos anteriores no envio até uma ação explícita',async()=>{
    const f=setup();f.db.prepare("UPDATE registros SET primeira_vez='2020-01-01 00:00:00'").run();f.db.prepare('DELETE FROM clientes_documentos').run();descobrirDocumentosClientes(f.db);
    await prepararEnvios(f.db,undefined,undefined,{pdf});expect(listarEnvios(f.db)).toHaveLength(0);
    descobrirDocumentosClientes(f.db,f.cid,true);await prepararEnvios(f.db,f.cid,undefined,{pdf});expect(listarEnvios(f.db)).toHaveLength(1);
  });
  it('bloqueia quando um original muda fora do sistema',()=>{
    const f=setup();writeFileSync(f.path,'arquivo alterado');expect(()=>obterRelatorio(f.db,numero)).toThrow(/alterado/);
  });
  it('requer consolidação atual e impede exportação com conflitos em aditivos',()=>{
    const f=setup(),n=`DF000002/${ano}`,path=join(pasta,randomUUID()+'.doc');writeFileSync(path,'Aditivo com alteração parcial do piso.');
    upsertRegistro(f.db,sindicato.nome,{numeroRegistro:n,numeroSolicitacao:'',tipo:'Termo Aditivo de Convenção Coletiva',vigencia:'',partes:'',indice:0});
    salvarArquivo(f.db,n,{path,hash:hashBytes(readFileSync(path)),bytes:50,original:'aditivo.doc'});
    atualizarArquivoEExtracao(f.db,n,path,{topicos:{},aditivo:{versao:'1.0',alteracoes:[{campo:'s02_piso_geral',acao:'revisar',valor:'R$ 2.700',clausula:'Cláusula 1',citacao:'alteração parcial'}]}});
    f.db.prepare("INSERT INTO vinculos_aditivos(aditivo_registro,base_registro,status) VALUES (?,?,'confirmado')").run(n,numero);
    expect(()=>obterRelatorio(f.db,numero)).toThrow(/consolidação/);
    const r=aplicarAlteracoes(f.p,numero,[{numero:n,data:null,alteracoes:[{campo:'s02_piso_geral',acao:'revisar',valor:'R$ 2.700',clausula:'Cláusula 1',citacao:'alteração parcial'}]}]);
    const docs=f.db.prepare('SELECT numero_registro,tipo,arquivo_path,arquivo_hash FROM registros ORDER BY numero_registro').all() as {numero_registro:string;tipo:string;arquivo_path:string;arquivo_hash:string}[];
    f.db.prepare("INSERT INTO consolidacoes_cct(base_registro,status,resultado_json,entrada_hash) VALUES (?,'consolidado',?,?)").run(numero,JSON.stringify(r),fingerprintDocumentos(docs));
    expect(()=>obterRelatorio(f.db,numero)).toThrow(/pendências/);
  });
  it('escapa HTML e mantém os 60 campos e referências na exportação',()=>{
    const f=setup(),r=obterRelatorio(f.db,numero);r.analise.padrao!.campos.s02_piso_geral='<script>alert(1)</script>';
    const html=renderizarRelatorioHtml(r,{razao_social:'Cliente <Alfa>',cnpj:cliente.cnpj});
    expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('Cláusula terceira');
    expect((html.match(/class="rotulo"/g)||[])).toHaveLength(CAMPOS_CCT.length);
  });
});
describe('fila por destinatário',()=>{
  it('prepara com análise concluída e aprovação humana; marca enviada só com aceitação SMTP',async()=>{
    const f=setup(),id=await preparar(f);expect(lerEnvio(f.db,id).status).toBe('revisao');
    let chamadas=0;await processarFila(f.db,{sendMail:async m=>{chamadas++;return aceitar(m);}});expect(chamadas).toBe(0);
    aprovarEnvio(f.db,id,'Diogo',vistaEnvio(f.db,id).previsualizacao_hash!);
    const resultado=await processarFila(f.db,{sendMail:async m=>{chamadas++;expect(m.to).toBe('maria@example.test');expect((m.attachments as unknown[]).length).toBe(2);return aceitar(m);}});
    expect(resultado.enviados).toBe(1);expect(lerEnvio(f.db,id).status).toBe('enviado');
    await prepararEnvios(f.db,undefined,undefined,{pdf});await processarFila(f.db,{sendMail:aceitar});expect(lerEnvio(f.db,id).tentativas).toBe(1);
  });
  it('mantém automática em revisão quando a aplicabilidade é candidata',async()=>{
    const f=setup('automatico'),id=await preparar(f,false);expect(lerEnvio(f.db,id).status).toBe('revisao');
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);
  });
  it('autoriza automático só quando as regras confirmam o documento',async()=>{
    const f=setup('automatico',true),id=await preparar(f,false);expect(lerEnvio(f.db,id).status).toBe('na_fila');
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(1);
  });
  it('mostra bloqueio de análise, sem fabricar PDF nem envio',async()=>{
    const f=setup('automatico',true,false);await prepararEnvios(f.db,undefined,undefined,{pdf});
    const e=listarEnvios(f.db)[0];expect(e.status).toBe('bloqueado');expect(e.snapshot).toBeNull();expect(e.motivo).toMatch(/análise/);
  });
  it('dois contatos têm resultados independentes e não repetem o destinatário já aceito',async()=>{
    const f=setup(),tid=salvarContato(f.db,null,{nome:'João DP',email:'joao@example.test'});
    salvarCliente(f.db,f.cid,{...cliente,contatos:[{contato_id:f.tid},{contato_id:tid}]});
    await preparar(f);for(const e of listarEnvios(f.db))aprovarEnvio(f.db,e.id,'Diogo');
    await processarFila(f.db,{sendMail:async m=>m.to==='maria@example.test'?aceitar(m):{accepted:[],rejected:[m.to]}});
    expect(listarEnvios(f.db).find(x=>x.contato_id===f.tid)?.status).toBe('enviado');
    expect(listarEnvios(f.db).find(x=>x.contato_id===tid)?.status).toBe('falhou');
    expect(listarEnvios(f.db).find(x=>x.contato_id===f.tid)?.tentativas).toBe(1);
  });
  it('filtra tipos e impede aprovação com prévia desatualizada',async()=>{
    const f=setup();salvarCliente(f.db,f.cid,{...cliente,contatos:[{contato_id:f.tid,tipos:['Acordo Coletivo']}]});
    await prepararEnvios(f.db,undefined,undefined,{pdf});expect(listarEnvios(f.db)).toHaveLength(0);
    salvarCliente(f.db,f.cid,{...cliente,contatos:[{contato_id:f.tid,tipos:[]}]});const id=await preparar(f);
    expect(()=>aprovarEnvio(f.db,id,'Diogo','0'.repeat(64))).toThrow(/prévia/);
  });
  it('invalida aprovação após mudar o e-mail; repreparar exige nova conferência',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');salvarContato(f.db,f.tid,{nome:'Maria RH',email:'outra@example.test'});
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);expect(lerEnvio(f.db,id).status).toBe('bloqueado');
    reprepararEnvio(f.db,id);await prepararEnvios(f.db,undefined,undefined,{pdf});expect(vistaEnvio(f.db,id).snapshot?.para).toBe('outra@example.test');
    expect(lerEnvio(f.db,id).status).toBe('revisao');
  });
  it('não envia após inativar o contato ou remover o sindicato',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');salvarCliente(f.db,f.cid,{...cliente,sindicatos:[]});
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);expect(lerEnvio(f.db,id).status).toBe('bloqueado');
  });
  it('gera nova comunicação quando a análise muda e preserva o histórico enviado',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');await processarFila(f.db,{sendMail:aceitar});
    f.p.campos.s02_piso_geral='R$ 2.600,00';atualizarArquivoEExtracao(f.db,numero,f.path,{padrao:f.p,topicos:{}});await prepararEnvios(f.db,undefined,undefined,{pdf});
    const rows=listarEnvios(f.db);expect(rows).toHaveLength(2);expect(rows.find(x=>x.id===id)?.status).toBe('enviado');expect(rows[0].snapshot?.assunto).toContain('Atualização');
  });
  it('reserva o envio e impede dois processamentos concorrentes',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');let count=0;
    const enviar=async(m:Record<string,unknown>)=>{count++;await Promise.resolve();return aceitar(m);};
    await Promise.all([processarFila(f.db,{sendMail:enviar}),processarFila(f.db,{sendMail:enviar})]);expect(count).toBe(1);
  });
  it('timeout fica incerto e exige confirmação explícita antes de nova tentativa',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');await processarFila(f.db,{sendMail:async()=>{throw Object.assign(new Error('timeout'),{code:'ETIMEDOUT'});}});
    expect(lerEnvio(f.db,id).status).toBe('incerto');expect(()=>reprepararEnvio(f.db,id)).toThrow(/duplicidade/);
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);reprepararEnvio(f.db,id,true);expect(lerEnvio(f.db,id).status).toBe('bloqueado');
  });
  it('reinício não assume sucesso ou repete automaticamente um envio interrompido',async()=>{
    const f=setup(),id=await preparar(f);f.db.prepare("UPDATE envios_clientes SET status='enviando' WHERE id=?").run(id);recuperarEnviosInterrompidos(f.db);
    expect(lerEnvio(f.db,id).status).toBe('incerto');
  });
  it('detecta anexo corrompido antes de chamar o SMTP e respeita cancelamento',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');const snap=JSON.parse(lerEnvio(f.db,id).snapshot_json!);writeFileSync(snap.anexos[1].path,'corrompido');
    let chamadas=0;await processarFila(f.db,{sendMail:async m=>{chamadas++;return aceitar(m);}});expect(chamadas).toBe(0);expect(lerEnvio(f.db,id).status).toBe('falhou');
    cancelarEnvio(f.db,id);await prepararEnvios(f.db,undefined,undefined,{pdf});expect(lerEnvio(f.db,id).status).toBe('cancelado');
  });
  it('separa empresas mesmo quando o mesmo contato recebe documentos de ambas',async()=>{
    const f=setup(),beta=salvarCliente(f.db,null,{...cliente,razao_social:'Empresa Beta Ltda',nome_fantasia:'Beta',cnpj:'11.444.777/0001-61',
      sindicatos:[{sindicato_id:f.sid}],contatos:[{contato_id:f.tid}]});
    descobrirDocumentosClientes(f.db);decidirDocumentoCliente(f.db,f.cid,numero,'confirmado','Diogo','Conferido Alfa');decidirDocumentoCliente(f.db,beta,numero,'confirmado','Diogo','Conferido Beta');
    await prepararEnvios(f.db,undefined,undefined,{pdf});for(const e of listarEnvios(f.db))aprovarEnvio(f.db,e.id,'Diogo');
    const mensagens:Record<string,unknown>[]=[];await processarFila(f.db,{sendMail:async m=>{mensagens.push(m);return aceitar(m);}});
    expect(mensagens).toHaveLength(2);expect(mensagens.filter(m=>String(m.text).includes(cliente.razao_social))).toHaveLength(1);
    expect(mensagens.filter(m=>String(m.text).includes('Empresa Beta Ltda'))).toHaveLength(1);
    expect(mensagens.every(m=>!(String(m.text).includes(cliente.razao_social)&&String(m.text).includes('Empresa Beta Ltda')))).toBe(true);
  });
  it('mantém a fila aprovada quando o SMTP está desativado',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');
    salvarNotificacoes(f.db,{slack:{ativo:false},email:{ativo:false,host:'',port:587,secure:false,user:'',from:'',to:''}});
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);expect(lerEnvio(f.db,id).status).toBe('na_fila');
  });
  it('repete falha temporária com limite, sem converter rejeição SMTP em sucesso',async()=>{
    const f=setup(),id=await preparar(f);aprovarEnvio(f.db,id,'Diogo');
    const rejeitar=async()=>{throw Object.assign(new Error('451 Temporário'),{responseCode:451});};
    for(let i=0;i<3;i++){if(i)f.db.prepare("UPDATE envios_clientes SET proxima_tentativa=datetime('now','-1 minute') WHERE id=?").run(id);await processarFila(f.db,{sendMail:rejeitar});}
    expect(lerEnvio(f.db,id).tentativas).toBe(3);expect(lerEnvio(f.db,id).proxima_tentativa).toBeNull();
    expect((await processarFila(f.db,{sendMail:aceitar})).enviados).toBe(0);expect(lerEnvio(f.db,id).status).toBe('falhou');
  });
  it('descarta uma prévia quando a análise muda enquanto o PDF é gerado',async()=>{
    const f=setup();decidirDocumentoCliente(f.db,f.cid,numero,'confirmado','Diogo','Conferido');
    await prepararEnvios(f.db,undefined,undefined,{pdf:async()=>{f.p.campos.s02_piso_geral='R$ 2.800,00';atualizarArquivoEExtracao(f.db,numero,f.path,{padrao:f.p,topicos:{}});return pdf();}});
    expect(listarEnvios(f.db)[0].status).toBe('falhou');expect(listarEnvios(f.db)[0].snapshot).toBeNull();
  });
});
