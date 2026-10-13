import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { z } from 'zod';
import {configuracaoColeta} from './coleta-config.js';
import {resumoEscritorioPostgres} from './postgres-office-summary.js';
import {listarAuditoriaPublicacoesPostgres,auditoriaPublicacoesCsv} from './postgres-publication-audit.js';
import { ErroCadastro, cnpjValido, normalizarCnpj } from './cadastros.js';
import { criarHashSenha } from './auth-core.js';
import {consultarCnpj} from './consulta-cnpj.js';
import { exigirPermissao,type Permissao } from './autorizacao.js';
import { buscarUsuarioPorEmailPostgres,excluirMonitoramentoPostgres,listarCatalogoSindicatosPostgres,listarClientesPostgres,listarContatosPostgres,listarEscritoriosPostgres,listarMonitoramentosPostgres,listarUsuariosDoEscritorioPostgres,obterClientePostgres,obterContatoPostgres,obterEscritorioPostgres,obterMonitoramentoPostgres,protegerUltimoAdministradorEscritorioPostgres,revogarVinculoPostgres,salvarClientePostgres,salvarContatoPostgres,salvarEscritorioPostgres,salvarMonitoramentoPostgres,salvarUsuarioPostgres,vincularUsuarioClientePostgres,vincularUsuarioEscritorioPostgres } from './postgres-organizacoes.js';
import { withPostgresGlobalTransaction, withPostgresOfficeTransaction } from './postgres-transaction.js';
import { alterarParticipacaoDocumentoPostgres,atualizarDocumentosClientePostgres,decidirDocumentoClientePostgres,listarDocumentosClientePostgres,originalDocumentoClientePostgres } from './postgres-documentos.js';
import { detalheInstrumentoPostgres,listarCatalogoInterpretacoesPostgres,salvarVinculoContextoPostgres } from './postgres-interpretacoes.js';
import { prepararRelatorioPublicacaoPostgres,consolidarInterpretacaoPostgres,exportarMarkdownInterpretacaoPostgres,revisarInterpretacaoPostgres,vistaInterpretacaoPostgres } from './postgres-consolidacao.js';
import { gerarPdfRelatorio,hashBytes } from './relatorio-core.js';
import { obterSmtpPostgres,salvarSmtpPostgres } from './postgres-smtp.js';
import { abrirPortalDocumentoPostgres,confirmarCienciaPortalPostgres,listarPortalDocumentosPostgres,listarPublicacoesPostgres,publicarDocumentoPostgres,revogarPublicacaoPostgres } from './postgres-publicacoes.js';
import { anexoEnvioPostgres,aprovarEnvioPostgres,cancelarEnvioPostgres,listarEnviosPostgres,processarFilaPostgres,recuperarEnviosPresosPostgres,reprepararEnvioPostgres } from './postgres-fila-envios.js';
import { prepararEnviosPostgres } from './postgres-preparacao-envios.js';
import type { criarAcessoHttpPostgres } from './postgres-auth-http.js';
import {solicitarMonitoramentoPostgres,listarSolicitacoesMonitoramentoPostgres,cancelarSolicitacaoMonitoramentoPostgres} from './postgres-monitoring-requests.js';
import {recuperarMonitoramentoPostgres} from './postgres-monitoring-recovery.js';
import {listarAgendasPostgres,salvarAgendaPostgres} from './postgres-monitoring-agendas.js';
import {obterLimitesMonitoramentoPostgres,salvarLimitesMonitoramentoPostgres} from './postgres-monitoring-settings.js';
import {testarConexaoIa} from './ia-connection-test.js';
import {obterIaConfiguradaPostgres,obterIaPostgres,salvarIaPostgres} from './postgres-ia-settings.js';
import {listarTentativasIaPostgres,recuperarAnalisePostgres,recuperarSolicitacaoIaPostgres} from './postgres-ia-recovery.js';
import {solicitarAnalisePostgres,listarSolicitacoesIaPostgres} from './postgres-ia-requests.js';

type Acesso=ReturnType<typeof criarAcessoHttpPostgres>;
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));return true;};

export async function tratarGestaoPostgres(req:IncomingMessage,res:ServerResponse,pool:Pool,url:URL,access:Acesso,
  body:(request:IncomingMessage)=>Promise<unknown>):Promise<boolean>{
  if(url.pathname==='/api/contexto/publicacoes/auditoria'){
    access.validarRequisicao(req);
    const identity=await access.identidade(req),context=await access.resolverContexto(req);
    if(context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    exigirPermissao(identity,'auditoria.ler',context);
    if(req.method!=='GET')return send(res,405,{erro:'Método não permitido.'});
    const rows=await listarAuditoriaPublicacoesPostgres(pool,context.escritorio_id);
    if(url.searchParams.get('formato')==='csv'){
      res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="auditoria-publicacoes.csv"','cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(auditoriaPublicacoesCsv(rows));return true;
    }
    return send(res,200,rows);
  }
  if(url.pathname==='/api/contexto/resumo'){
    access.validarRequisicao(req);
    const identity=await access.identidade(req),context=await access.resolverContexto(req);
    if(context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    exigirPermissao(identity,'clientes.ler',context);
    exigirPermissao(identity,'monitoramentos.ler',context);
    exigirPermissao(identity,'documentos.ler_internos',context);
    if(req.method!=='GET')return send(res,405,{erro:'Método não permitido.'});
    return send(res,200,await resumoEscritorioPostgres(pool,context.escritorio_id));
  }
  const platformCollection=url.pathname==='/api/plataforma/coleta';
  const unions=url.pathname.match(/^\/api\/plataforma\/sindicatos(?:\/([1-9]\d*))?$/);
  const global=url.pathname.match(/^\/api\/plataforma\/escritorios(?:\/([1-9]\d*))?$/);
  const local=url.pathname.match(/^\/api\/contexto\/(escritorio|usuarios|clientes|contatos|sindicatos|monitoramentos)(?:\/([1-9]\d*))?$/);
  const cnpjLookup=url.pathname.match(/^\/api\/contexto\/clientes\/consulta-cnpj\/([^/]+)$/);
  const documents=url.pathname.match(/^\/api\/contexto\/clientes\/([1-9]\d*)\/documentos(?:\/(atualizar|decidir|original|participacao))?$/);
  const interpretation=url.pathname.match(/^\/api\/contexto\/(interpretacoes|vinculos|revisoes)(?:\/(consolidar))?$/);
  const report=url.pathname==='/api/contexto/relatorio';
  const smtp=url.pathname==='/api/contexto/smtp';
  const publication=url.pathname==='/api/contexto/publicacoes',publicationRevoke=url.pathname.match(/^\/api\/contexto\/publicacoes\/([1-9]\d*)\/revogar$/);
  const portal=url.pathname.match(/^\/api\/portal\/documentos(?:\/([1-9]\d*)(?:\/(ciencia))?)?$/);
  const deliveries=url.pathname.match(/^\/api\/contexto\/envios(?:\/(preparar|recuperar|processar)|\/([1-9]\d*)\/(aprovar|cancelar|repreparar|anexos\/(\d+)))?$/);
  const executions=url.pathname.match(/^\/api\/contexto\/execucoes(?:\/([1-9]\d*)\/(cancelar|recuperar))?$/);
  const agendas=url.pathname.match(/^\/api\/contexto\/agendas(?:\/([1-9]\d*))?$/);
  const monitorLimits=url.pathname==='/api/contexto/limites-monitoramento';
  const iaAttempts=url.pathname.match(/^\/api\/plataforma\/ia\/tentativas(?:\/([1-9]\d*)\/(recuperar))?$/);
  const iaRequests=url.pathname.match(/^\/api\/plataforma\/ia\/solicitacoes(?:\/([1-9]\d*)\/recuperar)?$/);
  const iaTest=url.pathname==='/api/plataforma/ia/testar';
  const platformIa=iaTest||url.pathname==='/api/plataforma/ia'||!!iaAttempts||iaRequests;
  if(!cnpjLookup&&!unions&&!global&&!local&&!documents&&!interpretation&&!report&&!smtp&&!publication&&!publicationRevoke&&!portal&&!deliveries&&!executions&&!agendas&&!monitorLimits&&!platformIa&&!platformCollection)return false;
  access.validarRequisicao(req);
  const resource=local?.[1],id=Number(global?.[1]||local?.[2])||null;
  const authorize=async()=>{
    const identity=await access.identidade(req),context=unions||global||platformIa||platformCollection?undefined:await access.resolverContexto(req);
    if(context&&context.tipo!=='escritorio'&&!portal)throw new ErroCadastro('Selecione um escritório.',403);
    const permission:Permissao=cnpjLookup?'clientes.gerenciar':monitorLimits?(req.method==='GET'?'monitoramentos.ler':'escritorio.gerenciar'):agendas?(req.method==='GET'?'monitoramentos.ler':'escritorio.gerenciar'):executions?(executions[2]==='recuperar'?'escritorio.gerenciar':req.method==='GET'?'monitoramentos.ler':'monitoramentos.gerenciar'):portal?'documentos.ler_publicados':unions||global||platformIa||platformCollection?'plataforma.gerenciar':deliveries?(req.method==='GET'?'documentos.ler_internos':deliveries[1]==='preparar'?'documentos.revisar':'envios.aprovar'):smtp?'escritorio.gerenciar':publication||publicationRevoke?
      ['GET','HEAD'].includes(req.method??'GET')?'documentos.ler_internos':'documentos.publicar':report?'documentos.ler_internos':interpretation?
      (interpretation[1]==='interpretacoes'&&['GET','HEAD'].includes(req.method??'GET')&&!interpretation[2]?'documentos.ler_internos':'documentos.revisar'):
      documents?
      (['GET','HEAD'].includes(req.method??'GET')?'documentos.ler_internos':'documentos.revisar'):
      resource==='usuarios'?'usuarios.gerenciar':
      resource==='sindicatos'||resource==='monitoramentos'?resource==='sindicatos'?'monitoramentos.ler':
        ['GET','HEAD'].includes(req.method??'GET')?'monitoramentos.ler':'monitoramentos.gerenciar':
      resource==='clientes'||resource==='contatos'?['GET','HEAD'].includes(req.method??'GET')?'clientes.ler':'clientes.gerenciar':'escritorio.gerenciar';
    exigirPermissao(identity,permission,context);
    if(req.method!=='GET'&&req.method!=='HEAD')access.csrf(req);
    return {identity,context};
  };
  let current=await authorize();
  if(cnpjLookup){
    if(req.method!=='GET')return send(res,405,{erro:'Método não permitido.'});
    const result=await consultarCnpj(decodeURIComponent(cnpjLookup[1]));
    await authorize();
    return send(res,200,result);
  }
  const audit=async(client:import('pg').PoolClient,action:string,details:Record<string,unknown>,officeId:number|null,clientId:number|null=null)=>{
    const evt=access.event(req);
    await client.query(`INSERT INTO auditoria_seguranca(ator_id,acao,escritorio_id,cliente_id,criado_em,ip,user_agent,request_id,detalhes_json)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[current.identity.usuario_id,action,officeId,clientId,Date.now(),(evt.ip??'').slice(0,96),
      (evt.user_agent??'').slice(0,1000),evt.request_id??'',JSON.stringify(details)]);
  };
  if(platformCollection){
    if(req.method!=='GET')return send(res,405,{erro:'Método não permitido.'});
    return send(res,200,{...configuracaoColeta(),origem:'ambiente_processo',slack_contextual:false});
  }
  if(unions){
    const unionId=Number(unions[1])||null;
    if(req.method==='GET'&&!unionId)return send(res,200,await withPostgresGlobalTransaction(pool,async client=>(await client.query('SELECT id,nome,cnpj,ativo FROM sindicatos ORDER BY lower(nome),id')).rows));
    if((req.method==='POST'&&!unionId)||(req.method==='PUT'&&unionId)){
      const data=z.object({nome:z.string().trim().min(2).max(250),cnpj:z.string().trim().max(25).default('').transform(normalizarCnpj).refine(value=>value===''||cnpjValido(value),'CNPJ inválido.'),ativo:z.boolean()}).strict().parse(await body(req));current=await authorize();
      const saved=await withPostgresGlobalTransaction(pool,async client=>{
        const result=unionId?await client.query('UPDATE sindicatos SET nome=$1,cnpj=$2,ativo=$3 WHERE id=$4 RETURNING id',[data.nome,data.cnpj,data.ativo,unionId]):await client.query('INSERT INTO sindicatos(nome,cnpj,ativo) VALUES($1,$2,$3) RETURNING id',[data.nome,data.cnpj,data.ativo]);
        if(!result.rowCount)throw new ErroCadastro('Sindicato não encontrado.',404);
        const id=result.rows[0].id;await audit(client,'CATALOGO_SINDICATO_SALVO',{sindicato_id:id,operacao:unionId?'editar':'criar'},null);return id;
      });return send(res,unionId?200:201,{id:saved});
    }
    return send(res,405,{erro:'Método não permitido. Use a situação inativa para preservar os vínculos.'});
  }
  if(platformIa){
    if(iaTest){
      if(req.method!=='POST')return send(res,405,{erro:'Método não permitido.'});
      const input=z.object({versao:z.number().int().nonnegative()}).strict().parse(await body(req));current=await authorize();
      const config=await withPostgresGlobalTransaction(pool,async client=>{
        const value=await obterIaConfiguradaPostgres(client);
        if(!value||!value.base_url||!value.modelo)throw new ErroCadastro('Salve o endereço e o modelo antes de testar.',400);
        if(value.versao!==input.versao)throw new ErroCadastro('Configuração IA alterada; recarregue antes de testar.',409);
        await audit(client,'IA_CONEXAO_TESTE_SOLICITADO',{versao:input.versao},null);return value;
      });
      const result=await testarConexaoIa(config);current=await authorize();
      const latestVersion=await withPostgresGlobalTransaction(pool,async client=>{
        const latest=await obterIaPostgres(client);
        await audit(client,'IA_CONEXAO_TESTE_CONCLUIDO',{versao:input.versao,ok:result.ok,ms:result.ms},null);
        return latest.versao;
      });
      if(latestVersion!==input.versao)throw new ErroCadastro('Configuração IA alterada durante o teste; recarregue e teste novamente.',409);
      return send(res,200,result);
    }

    if(iaRequests){
      if(iaRequests[1]){
        if(req.method!=='POST')return send(res,405,{erro:'Método não permitido.'});
        const raw=await body(req);current=await authorize();
        return send(res,200,await recuperarSolicitacaoIaPostgres(pool,Number(iaRequests[1]),raw,
          (client,details)=>audit(client,'IA_SOLICITACAO_RECUPERADA',details,null)));
      }
      if(req.method==='GET')return send(res,200,await withPostgresGlobalTransaction(pool,client=>listarSolicitacoesIaPostgres(client)));
      if(req.method==='POST'){
        const raw=await body(req);current=await authorize();
        const result=await withPostgresGlobalTransaction(pool,async client=>{
          const queued=await solicitarAnalisePostgres(client,current.identity.usuario_id,raw);
          await audit(client,'IA_EXTRACAO_SOLICITADA',{solicitacao_id:queued.id,numero_registro:queued.numero_registro},null);return queued;
        });return send(res,202,result);
      }
      return send(res,405,{erro:'Método não permitido.'});
    }
    if(iaAttempts){
      if(!iaAttempts[1]&&req.method==='GET')return send(res,200,await withPostgresGlobalTransaction(pool,client=>listarTentativasIaPostgres(client)));
      if(iaAttempts[1]&&req.method==='POST'){
        const raw=await body(req);current=await authorize();
        return send(res,200,await recuperarAnalisePostgres(pool,Number(iaAttempts[1]),raw,
          (client,details)=>audit(client,'IA_EXTRACAO_RECUPERADA',details,null)));
      }
      return send(res,405,{erro:'Método não permitido.'});
    }
    if(req.method==='GET')return send(res,200,await withPostgresGlobalTransaction(pool,client=>obterIaPostgres(client)));
    if(req.method==='PUT'){
      const raw=await body(req);current=await authorize();
      const saved=await withPostgresGlobalTransaction(pool,async client=>{
        const value=await salvarIaPostgres(client,raw);
        await audit(client,'IA_PLATAFORMA_CONFIGURADA',{ativo:value.ativo,versao:value.versao,tem_chave:value.tem_chave},null);
        return value;
      });return send(res,200,saved);
    }
    return send(res,405,{erro:'Método não permitido.'});
  }
  if(monitorLimits){
    if(req.method==='GET'){
      const office=current.context!.escritorio_id;
      return send(res,200,await withPostgresOfficeTransaction(pool,office,client=>obterLimitesMonitoramentoPostgres(client,office)));
    }
    if(req.method==='PUT'){
      const raw=await body(req);current=await authorize();const office=current.context!.escritorio_id;
      await withPostgresOfficeTransaction(pool,office,async client=>{
        const data=await salvarLimitesMonitoramentoPostgres(client,office,raw);
        await audit(client,'MONITORAMENTO_LIMITES_SALVOS',data,office);
      });return send(res,200,{ok:true});
    }
    return send(res,405,{erro:'Método não permitido.'});
  }
  if(agendas){
    const office=current.context!.escritorio_id;
    if(req.method==='GET'&&!agendas[1])return send(res,200,await withPostgresOfficeTransaction(pool,office,client=>listarAgendasPostgres(client,office)));
    if(req.method==='PUT'&&agendas[1]){
      const raw=await body(req);current=await authorize();const currentOffice=current.context!.escritorio_id;
      await withPostgresOfficeTransaction(pool,currentOffice,async client=>{
        const data=await salvarAgendaPostgres(client,currentOffice,Number(agendas[1]),raw);
        await audit(client,'MONITORAMENTO_AGENDA_SALVA',{monitoramento_id:Number(agendas[1]),...data},currentOffice);
      });return send(res,200,{ok:true});
    }
    return send(res,405,{erro:'Método não permitido.'});
  }
  if(executions){
    if(req.method==='GET'&&!executions[1]){
      const context=current.context!;
      return send(res,200,await withPostgresOfficeTransaction(pool,context.escritorio_id,client=>listarSolicitacoesMonitoramentoPostgres(client,context.escritorio_id)));
    }
    if(req.method==='POST'){
      const raw=await body(req);current=await authorize();
      const office=current.context!.escritorio_id;
      if(executions[1]){
        if(executions[2]==='recuperar'){
          const recovered=await recuperarMonitoramentoPostgres(pool,office,Number(executions[1]),raw,
            (client,details)=>audit(client,'MONITORAMENTO_EXECUCAO_RECUPERADA',details,office));
          return send(res,200,recovered);
        }
        z.object({}).strict().parse(raw);
        const executionId=Number(executions[1]);
        if(!Number.isSafeInteger(executionId))throw new ErroCadastro('Identificador inválido.',400);
        await withPostgresOfficeTransaction(pool,office,async client=>{
          await cancelarSolicitacaoMonitoramentoPostgres(client,office,executionId);
          await audit(client,'MONITORAMENTO_CANCELAMENTO_SOLICITADO',{execucao_id:executionId},office);
        });return send(res,200,{ok:true});
      }
      const executionId=await withPostgresOfficeTransaction(pool,office,async client=>{
        const created=await solicitarMonitoramentoPostgres(client,office,current.identity.usuario_id,raw);
        await audit(client,'MONITORAMENTO_EXECUCAO_SOLICITADA',{execucao_id:created},office);return created;
      });return send(res,202,{id:executionId,status:'solicitada'});
    }
    return send(res,405,{erro:'Método não permitido.'});
  }
  if(global){
    if(req.method==='GET'){
      if(!id)return send(res,200,await listarEscritoriosPostgres(pool));
      const office=await obterEscritorioPostgres(pool,id);if(!office)throw new ErroCadastro('Escritório não encontrado.',404);return send(res,200,office);
    }
    if(req.method==='POST'&&!id){
      const raw=await body(req);current=await authorize();
      const officeId=await withPostgresGlobalTransaction(pool,async client=>{
        const created=await salvarEscritorioPostgres(client,null,raw);
        await audit(client,'ESCRITORIO_SALVO',{escritorio_id:created,operacao:'criar'},null);return created;
      });return send(res,201,{id:officeId});
    }
    if(req.method==='PUT'&&id){
      const raw=await body(req);current=await authorize();
      await withPostgresGlobalTransaction(pool,async client=>{await salvarEscritorioPostgres(client,id,raw);await audit(client,'ESCRITORIO_SALVO',{escritorio_id:id,operacao:'editar'},null);});
      return send(res,200,{id});
    }
    if(req.method==='DELETE'&&id){
      current=await authorize();
      await withPostgresGlobalTransaction(pool,async client=>{
        const office=await client.query('SELECT 1 FROM escritorios WHERE id=$1 FOR UPDATE',[id]);
        if(!office.rowCount)throw new ErroCadastro('Escritório não encontrado.',404);
        await client.query('DELETE FROM escritorios WHERE id=$1',[id]);
        await client.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
          VALUES(NULL,'escritorio',$1,'excluir',$2::jsonb)`,[String(id),JSON.stringify({origem:'servico_postgres',ator_id:current.identity.usuario_id})]);
        await audit(client,'ESCRITORIO_EXCLUIDO',{escritorio_id:id},null);
      });
      return send(res,200,{ok:true});
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(smtp){
    if(!current.context||current.context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    if(req.method==='GET')return send(res,200,await obterSmtpPostgres(pool,current.context.escritorio_id));
    if(req.method==='PUT'||req.method==='POST'){
      const raw=await body(req);current=await authorize();const context=current.context;if(!context||context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
      const result=await withPostgresOfficeTransaction(pool,context.escritorio_id,async client=>{const view=await salvarSmtpPostgres(client,context.escritorio_id,raw);await audit(client,'SMTP_ESCRITORIO_ATUALIZADO',{versao:view.versao,ativo:view.ativo,host:view.host,remetente:view.remetente},context.escritorio_id);return view;});return send(res,200,result);
    }
  }
  if(publication||publicationRevoke){
    const context=current.context;if(!context||context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    if(publication&&req.method==='GET')return send(res,200,await listarPublicacoesPostgres(pool,context.escritorio_id));
    if(publication&&req.method==='POST'){
      const raw=await body(req);current=await authorize();const fresh=current.context;if(!fresh||fresh.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
      const result=await publicarDocumentoPostgres(pool,fresh.escritorio_id,current.identity.usuario_id,raw,access.event(req));return send(res,201,result);
    }
    if(publicationRevoke&&req.method==='POST'){
      current=await authorize();const fresh=current.context;if(!fresh||fresh.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
      return send(res,200,await revogarPublicacaoPostgres(pool,fresh.escritorio_id,Number(publicationRevoke[1]),current.identity.usuario_id,access.event(req)));
    }
  }
  if(portal){
    const context=current.context;if(!context||context.tipo!=='cliente'||!context.cliente_id)throw new ErroCadastro('Selecione uma empresa cliente.',403);
    const portalContext={escritorio_id:context.escritorio_id,cliente_id:context.cliente_id},actor=current.identity.usuario_id;
    if(portal[1]===undefined&&req.method==='GET')return send(res,200,await listarPortalDocumentosPostgres(pool,portalContext,actor));
    if(portal[1]&&portal[2]==='ciencia'&&req.method==='POST'){
      z.object({confirmo:z.literal(true)}).strict().parse(await body(req));current=await authorize();
      const fresh=current.context;if(!fresh||fresh.tipo!=='cliente'||!fresh.cliente_id)throw new ErroCadastro('Selecione uma empresa cliente.',403);
      return send(res,200,await confirmarCienciaPortalPostgres(pool,{escritorio_id:fresh.escritorio_id,cliente_id:fresh.cliente_id},current.identity.usuario_id,Number(portal[1]),access.event(req)));
    }
    if(portal[1]&&!portal[2]&&req.method==='GET'){
      const file=await abrirPortalDocumentoPostgres(pool,portalContext,actor,Number(portal[1]),url.searchParams.has('download'),access.event(req));
      res.writeHead(200,{'content-type':'application/pdf','content-disposition':`${url.searchParams.has('download')?'attachment':'inline'}; filename="${file.nome}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(file.bytes);return true;
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(deliveries){
    const context=current.context;if(!context||context.tipo!=='escritorio')throw new ErroCadastro('Selecione um escritório.',403);
    const officeId=context.escritorio_id;
    if(req.method==='GET'&&!deliveries[1]&&!deliveries[2])return send(res,200,await listarEnviosPostgres(pool,officeId));
    if(req.method==='POST'&&deliveries[1]==='preparar'){
      const data=z.object({cliente_id:z.number().int().positive().optional()}).strict().parse(await body(req));current=await authorize();
      if(data.cliente_id){const exists=await withPostgresOfficeTransaction(pool,officeId,client=>client.query('SELECT 1 FROM clientes WHERE id=$1 AND escritorio_id=$2',[data.cliente_id,officeId]));if(!exists.rowCount)throw new ErroCadastro('Cliente não encontrado neste escritório.',404);}
      const outcome=await prepararEnviosPostgres(pool,officeId,data.cliente_id,undefined,{origem:{tipo:'usuario',usuario_id:current.identity.usuario_id},evento:access.event(req)});
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ENVIOS_ESCRITORIO_PREPARADOS',data.cliente_id?{...outcome,cliente_id:data.cliente_id}:outcome,officeId,data.cliente_id??null));
      return send(res,200,outcome);
    }
    if(req.method==='POST'&&deliveries[3]==='aprovar'&&deliveries[2]){
      const data=z.object({previsualizacao_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));current=await authorize();
      await aprovarEnvioPostgres(pool,officeId,Number(deliveries[2]),current.identity.nome,data.previsualizacao_hash);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ENVIO_ESCRITORIO_APROVADO',{envio_id:Number(deliveries[2])},officeId));
      return send(res,200,{ok:true});
    }
    if(req.method==='POST'&&deliveries[3]==='cancelar'&&deliveries[2]){
      z.object({}).strict().parse(await body(req));current=await authorize();
      await cancelarEnvioPostgres(pool,officeId,Number(deliveries[2]));
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ENVIO_ESCRITORIO_CANCELADO',{envio_id:Number(deliveries[2])},officeId));
      return send(res,200,{ok:true});
    }
    if(req.method==='POST'&&deliveries[3]==='repreparar'&&deliveries[2]){
      const data=z.object({confirmar_risco:z.boolean().default(false)}).strict().parse(await body(req));current=await authorize();
      const target=await reprepararEnvioPostgres(pool,officeId,Number(deliveries[2]),data.confirmar_risco);
      const outcome=await prepararEnviosPostgres(pool,officeId,target.cliente_id,target,{origem:{tipo:'usuario',usuario_id:current.identity.usuario_id},evento:access.event(req)});
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ENVIO_ESCRITORIO_REPREPARADO',{envio_id:Number(deliveries[2]),confirmar_risco:data.confirmar_risco,...outcome},officeId));
      return send(res,200,{...outcome,envio_id:Number(deliveries[2])});
    }
    if(req.method==='GET'&&deliveries[3]?.startsWith('anexos/')&&deliveries[2]&&deliveries[4]!==undefined){
      const file=await anexoEnvioPostgres(pool,officeId,Number(deliveries[2]),Number(deliveries[4]));
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ANEXO_ENVIO_ESCRITORIO_EXPORTADO',{envio_id:Number(deliveries[2]),indice:Number(deliveries[4])},officeId));
      res.writeHead(200,{'content-type':file.nome.toLowerCase().endsWith('.pdf')?'application/pdf':'application/msword','content-disposition':`attachment; filename="${file.nome.replace(/[^a-z0-9_.-]/gi,'_')}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(file.bytes);return true;
    }
    if(req.method==='POST'&&deliveries[1]==='recuperar'){
      const data=z.object({mais_antigo_que_segundos:z.number().int().min(60).max(86400).optional()}).strict().parse(await body(req));current=await authorize();
      const recovered=await recuperarEnviosPresosPostgres(pool,officeId,data.mais_antigo_que_segundos??900);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ENVIOS_ESCRITORIO_RECUPERADOS',{recuperados:recovered},officeId));
      return send(res,200,{recuperados:recovered});
    }
    if(req.method==='POST'&&deliveries[1]==='processar'){
      z.object({}).strict().parse(await body(req));current=await authorize();
      const outcome=await processarFilaPostgres(pool,officeId);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'FILA_ENVIOS_PROCESSADA_MANUALMENTE',outcome,officeId));
      return send(res,200,outcome);
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  const officeId=current.context!.escritorio_id;
  if(report){
    if(req.method!=='GET')throw new ErroCadastro('Método não permitido.',405);
    const clientId=z.coerce.number().int().positive().safe().parse(url.searchParams.get('cliente'));
    const base=z.string().trim().min(1).max(100).parse(url.searchParams.get('base'));
    const format=z.enum(['md','pdf']).parse(url.searchParams.get('formato'));
    const first=await exportarMarkdownInterpretacaoPostgres(pool,officeId,clientId,base);
    const prepared=format==='pdf'?await prepararRelatorioPublicacaoPostgres(pool,officeId,clientId,base):null;
    const bytes=prepared?await gerarPdfRelatorio(prepared.relatorio,prepared.cliente):first.bytes;
    current=await authorize();
    const second=await exportarMarkdownInterpretacaoPostgres(pool,officeId,clientId,base);
    if(first.versao!==second.versao||!first.bytes.equals(second.bytes))throw new ErroCadastro('Relatório alterado durante a exportação. Atualize.',409);
    if(prepared){const latest=await prepararRelatorioPublicacaoPostgres(pool,officeId,clientId,base);if(latest.fingerprint!==prepared.fingerprint)throw new ErroCadastro('Relatório alterado durante a exportação. Atualize.',409);}
    await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'RELATORIO_INTERNO_EXPORTADO',{cliente_id:clientId,base,versao:first.versao,versao_relatorio:prepared?.relatorio.versao??first.versao,formato:format,hash:hashBytes(bytes)},officeId,clientId));
    res.writeHead(200,{'content-type':format==='pdf'?'application/pdf':'text/markdown; charset=utf-8','cache-control':'no-store',
      'content-disposition':`attachment; filename="${first.nome.replace(/\.md$/,'.'+format)}"`,'x-content-type-options':'nosniff'});res.end(bytes);return true;
  }
  if(interpretation){
    if(req.method==='GET'&&interpretation[1]==='interpretacoes'){
      const numero=url.searchParams.get('numero');if(numero!==null)return send(res,200,await detalheInstrumentoPostgres(pool,officeId,numero));
      const base=url.searchParams.get('base');return send(res,200,base?await vistaInterpretacaoPostgres(pool,officeId,z.string().trim().min(1).max(100).parse(base)):
        await listarCatalogoInterpretacoesPostgres(pool,officeId));
    }
    if(req.method==='POST'&&interpretation[1]==='interpretacoes'&&interpretation[2]==='consolidar'){
      const data=z.object({base:z.string().trim().min(1).max(100)}).strict().parse(await body(req));current=await authorize();
      await consolidarInterpretacaoPostgres(pool,officeId,data.base,current.identity.usuario_id,
        (client,details)=>audit(client,'CONSOLIDACAO_ESCRITORIO_GERADA',details,officeId));
      return send(res,200,await vistaInterpretacaoPostgres(pool,officeId,data.base));
    }
    if(req.method==='POST'&&interpretation[1]==='revisoes'&&!interpretation[2]){
      const raw=await body(req);current=await authorize();
      const saved=await revisarInterpretacaoPostgres(pool,officeId,current.identity,raw,
        (client,details)=>audit(client,'INTERPRETACAO_REVISADA',details,officeId));
      const base=(raw as {base?:unknown})?.base;
      return send(res,200,{...saved,interpretacao:await vistaInterpretacaoPostgres(pool,officeId,z.string().trim().min(1).max(100).parse(base))});
    }
    if(req.method==='POST'&&interpretation[1]==='vinculos'){
      const raw=await body(req);current=await authorize();
      const saved=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const link=await salvarVinculoContextoPostgres(client,officeId,current.identity.usuario_id,raw);
        await audit(client,'VINCULO_ADITIVO_DECIDIDO',link,officeId);return link;
      });return send(res,200,saved);
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(documents){
    const clientId=Number(documents[1]),action=documents[2];
    if(req.method==='GET'&&!action)return send(res,200,await listarDocumentosClientePostgres(pool,officeId,clientId));
    if(req.method==='GET'&&action==='original'){
      const number=z.string().min(1).max(100).parse(url.searchParams.get('numero'));
      const original=await originalDocumentoClientePostgres(pool,officeId,clientId,number);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'ORIGINAL_INTERNO_DISPONIBILIZADO',{numero:number,hash:original.hash},officeId,clientId));
      res.writeHead(200,{'content-type':original.tipo,'content-disposition':`attachment; filename="${original.nome}"`,'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(original.bytes);return true;
    }
    if(req.method==='POST'&&action==='atualizar'){
      z.object({}).strict().parse(await body(req));current=await authorize();
      const total=await atualizarDocumentosClientePostgres(pool,officeId,clientId);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'DOCUMENTOS_CLIENTE_ATUALIZADOS',{total,cliente_id:clientId},officeId));
      return send(res,200,await listarDocumentosClientePostgres(pool,officeId,clientId));
    }
    if(req.method==='POST'&&action==='participacao'){
      const data=z.object({numero:z.string().min(1).max(100),incluir_envio:z.boolean(),justificativa:z.string().trim().min(1).max(2000),versao:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));
      current=await authorize();
      await alterarParticipacaoDocumentoPostgres(pool,officeId,clientId,data.numero,data,current.identity.usuario_id);
      return send(res,200,await listarDocumentosClientePostgres(pool,officeId,clientId));
    }
    if(req.method==='POST'&&action==='decidir'){
      const data=z.object({numero:z.string().min(1).max(100),status:z.enum(['confirmado','rejeitado']),
        justificativa:z.string().trim().min(1).max(2000),versao:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));
      current=await authorize();
      await decidirDocumentoClientePostgres(pool,officeId,clientId,data.numero,{...data,responsavel:current.identity.nome},current.identity.usuario_id);
      await withPostgresOfficeTransaction(pool,officeId,client=>audit(client,'APLICABILIDADE_DECIDIDA',{numero:data.numero,status:data.status,justificativa:data.justificativa,cliente_id:clientId},officeId));
      return send(res,200,await listarDocumentosClientePostgres(pool,officeId,clientId));
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(resource==='sindicatos'){
    if(req.method!=='GET'||id)throw new ErroCadastro('Catálogo compartilhado disponível somente para consulta.',405);
    return send(res,200,await listarCatalogoSindicatosPostgres(pool,officeId));
  }
  if(resource==='monitoramentos'){
    if(req.method==='GET')return send(res,200,id?await obterMonitoramentoPostgres(pool,officeId,id):await listarMonitoramentosPostgres(pool,officeId));
    if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)){
      const raw=await body(req);current=await authorize();
      const saved=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const monitorId=await salvarMonitoramentoPostgres(client,officeId,id,raw);
        await audit(client,'MONITORAMENTO_CONTEXTO_SALVO',{monitoramento_id:monitorId,operacao:id?'editar':'criar'},officeId);
        return monitorId;
      });return send(res,id?200:201,{id:saved});
    }
    if(req.method==='DELETE'&&id){
      current=await authorize();await withPostgresOfficeTransaction(pool,officeId,async client=>{
        await excluirMonitoramentoPostgres(client,officeId,id);
        await audit(client,'MONITORAMENTO_CONTEXTO_EXCLUIDO',{monitoramento_id:id},officeId);
      });return send(res,200,{ok:true});
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(resource==='clientes'||resource==='contatos'){
    const kind=resource,idParam=local?.[2]?Number(local[2]):null;
    if(req.method==='GET'&&idParam===null)return send(res,200,kind==='clientes'?await listarClientesPostgres(pool,officeId):await listarContatosPostgres(pool,officeId));
    if(req.method==='GET'&&idParam!==null)return send(res,200,kind==='clientes'?await obterClientePostgres(pool,officeId,idParam):await obterContatoPostgres(pool,officeId,idParam));
    if((req.method==='POST'&&idParam===null)||(req.method==='PUT'&&idParam!==null)){
      const raw=await body(req);current=await authorize();
      const newId=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const office=await client.query('SELECT 1 FROM escritorios WHERE id=$1 AND ativo=true',[officeId]);if(!office.rowCount)throw new ErroCadastro('Escritório inativo ou não encontrado.',409);
        return kind==='clientes'?salvarClientePostgres(client,officeId,idParam,raw,current.identity.usuario_id):salvarContatoPostgres(client,officeId,idParam,raw,current.identity.usuario_id);
      });return send(res,idParam===null?201:200,{id:newId});
    }
    if(req.method==='DELETE'&&idParam!==null){
      current=await authorize();
      await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const table=kind==='clientes'?'clientes':'contatos',field=kind==='clientes'?'cliente_id':'contato_id';
        const entry=await client.query(`SELECT id FROM ${table} WHERE id=$1 AND escritorio_id=$2 FOR UPDATE`,[idParam,officeId]);
        if(!entry.rowCount)throw new ErroCadastro(kind==='clientes'?'Cliente não encontrado.':'Contato não encontrado.',404);
        const used=kind==='clientes'
          ? await client.query(`SELECT 1 FROM clientes_sindicatos WHERE cliente_id=$1 UNION SELECT 1 FROM clientes_documentos WHERE cliente_id=$1
              UNION SELECT 1 FROM envios_clientes WHERE cliente_id=$1 UNION SELECT 1 FROM usuarios_clientes WHERE cliente_id=$1 LIMIT 1`,[idParam])
          : await client.query(`SELECT 1 FROM clientes_contatos WHERE contato_id=$1 AND escritorio_id=$2 UNION SELECT 1 FROM envios_clientes WHERE contato_id=$1 AND escritorio_id=$2 LIMIT 1`,[idParam,officeId]);
        if(used.rowCount)throw new ErroCadastro('Cadastro possui vínculos ou histórico. Inative-o para preservar os registros.',409);
        await client.query(`DELETE FROM ${table} WHERE id=$1 AND escritorio_id=$2`,[idParam,officeId]);
        await client.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json) VALUES($1,$2,$3,'excluir',$4::jsonb)`,
          [officeId,kind,String(idParam),JSON.stringify({ator_id:current.identity.usuario_id,origem:'servico_postgres'})]);
      }).catch(error=>{if(['23503','23514'].includes((error as {code?:string}).code??''))throw new ErroCadastro('Cadastro possui vínculos ou histórico. Inative-o para preservar os registros.',409);throw error;});return send(res,200,{ok:true});
    }
    throw new ErroCadastro('Método não permitido.',405);
  }
  if(resource==='escritorio'&&!id){
    if(req.method==='GET'){
      const office=await obterEscritorioPostgres(pool,officeId);if(!office)throw new ErroCadastro('Escritório não encontrado.',404);return send(res,200,office);
    }
    if(req.method==='PUT'){
      const data=z.object({nome:z.string().trim().min(2).max(250),email:z.union([z.string().trim().toLowerCase().email().max(254),z.literal('')]),telefone:z.string().trim().max(500)}).strict().parse(await body(req));
      current=await authorize();
      await withPostgresOfficeTransaction(pool,officeId,async client=>{
        const result=await client.query('UPDATE escritorios SET nome=$1,email=$2,telefone=$3,atualizado_em=now() WHERE id=$4 RETURNING id',
          [data.nome,data.email,data.telefone,officeId]);if(!result.rowCount)throw new ErroCadastro('Escritório não encontrado.',404);
        await client.query(`INSERT INTO auditoria_clientes(escritorio_id,entidade,entidade_id,acao,detalhes_json)
          VALUES($1,'escritorio',$2,'perfil_editado',$3::jsonb)`,[officeId,String(officeId),JSON.stringify({depois:data,origem:'servico_postgres'})]);
        await audit(client,'ESCRITORIO_PERFIL_EDITADO',data,officeId);
      });
      return send(res,200,await obterEscritorioPostgres(pool,officeId));
    }
  }
  if(resource==='usuarios'){
    if(req.method==='GET'&&!id)return send(res,200,await listarUsuariosDoEscritorioPostgres(pool,officeId));
    if(req.method==='POST'&&!id){
      const data=z.object({modo:z.enum(['cadastrar','vincular']),nome:z.string().trim().min(2).max(250).optional(),email:z.string().trim().toLowerCase().email().max(254),
        senha:z.string().min(15).max(128).optional(),papel:z.enum(['administrador','operador','cliente']),cliente_id:z.number().int().positive().optional()}).strict().parse(await body(req));
      if((data.papel==='cliente')!==!!data.cliente_id)throw new ErroCadastro('Informe uma empresa somente para representantes.',400);
      if(data.modo==='cadastrar'&&(!data.nome||!data.senha))throw new ErroCadastro('Informe nome e senha inicial.',400);
      if(data.modo==='vincular'&&(data.senha||data.nome))throw new ErroCadastro('Vínculo não altera a identidade ou senha existente.',400);
      const passwordHash=data.modo==='cadastrar'?await criarHashSenha(data.senha!):null;
      current=await authorize();
      const userId=await withPostgresOfficeTransaction(pool,officeId,async client=>{
        let user=await buscarUsuarioPorEmailPostgres(client,data.email);
        if(data.modo==='cadastrar'){
          if(user)throw new ErroCadastro('Cadastro indisponível. Use o vínculo de uma conta existente ou consulte a plataforma.',409);
          const created=await salvarUsuarioPostgres(client,null,{nome:data.nome,email:data.email},current.identity.usuario_id);
          await client.query('INSERT INTO credenciais_usuarios(usuario_id,senha_hash,atualizado_em) VALUES($1,$2,$3)',[created,passwordHash,Date.now()]);
          user=await buscarUsuarioPorEmailPostgres(client,data.email);
        }
        if(!user||!user.ativo)throw new ErroCadastro('Não foi possível vincular essa conta.',409);
        if(data.cliente_id){
          const clientRow=await client.query('SELECT 1 FROM clientes WHERE id=$1 AND escritorio_id=$2',[data.cliente_id,officeId]);
          if(!clientRow.rowCount)throw new ErroCadastro('Cliente não encontrado.',404);
          await vincularUsuarioClientePostgres(client,user.id,data.cliente_id,current.identity.usuario_id);
        }else{
          await protegerUltimoAdministradorEscritorioPostgres(client,officeId,user.id,data.papel as 'administrador'|'operador');
          await vincularUsuarioEscritorioPostgres(client,user.id,officeId,data.papel as 'administrador'|'operador',current.identity.usuario_id);
        }
        await audit(client,'USUARIO_VINCULADO',{usuario_id:user.id,papel:data.papel,cliente_id:data.cliente_id??null,novo:data.modo==='cadastrar'},officeId);
        return user.id;
      });return send(res,201,{id:userId});
    }
    if(req.method==='PUT'&&id){
      const data=z.object({papel:z.enum(['administrador','operador']).optional(),ativo:z.boolean(),cliente_id:z.number().int().positive().optional()}).strict().parse(await body(req));
      current=await authorize();
      await withPostgresOfficeTransaction(pool,officeId,async client=>{
        if(data.cliente_id){
          if(data.papel)throw new ErroCadastro('Representante não possui papel de funcionário.',400);
          const link=await client.query('SELECT 1 FROM usuarios_clientes WHERE usuario_id=$1 AND cliente_id=$2 AND escritorio_id=$3',[id,data.cliente_id,officeId]);
          if(!link.rowCount)throw new ErroCadastro('Vínculo não encontrado.',404);
          if(data.ativo)await vincularUsuarioClientePostgres(client,id,data.cliente_id,current.identity.usuario_id);
          else await revogarVinculoPostgres(client,id,'cliente',data.cliente_id,current.identity.usuario_id);
        }else{
          const membership=await client.query<{papel:'administrador'|'operador'}>('SELECT papel FROM usuarios_escritorios WHERE usuario_id=$1 AND escritorio_id=$2',[id,officeId]);
          const previous=membership.rows[0]?.papel;if(!previous)throw new ErroCadastro('Vínculo não encontrado.',404);
          const next=data.ativo?(data.papel??previous):'revogado';
          await protegerUltimoAdministradorEscritorioPostgres(client,officeId,id,next);
          if(data.ativo)await vincularUsuarioEscritorioPostgres(client,id,officeId,data.papel??previous,current.identity.usuario_id);
          else await revogarVinculoPostgres(client,id,'escritorio',officeId,current.identity.usuario_id);
        }
        await audit(client,'USUARIO_VINCULO_EDITADO',{usuario_id:id,...data},officeId);
      });return send(res,200,{ok:true});
    }
  }
  throw new ErroCadastro('Método não permitido.',405);
}




