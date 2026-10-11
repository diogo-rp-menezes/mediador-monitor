import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ErroCadastro } from './cadastros.js';

type Banco=Database.Database;
export interface SmtpEscritorio { ativo:boolean; host:string; port:number; secure:boolean; user:string; password:string; from:string }
export type VistaSmtpEscritorio=Omit<SmtpEscritorio,'password'>&{temSenha:boolean;versao:number};
const chave=()=>{ const raw=process.env.CREDENTIALS_MASTER_KEY||''; const key=Buffer.from(raw,'base64'); if(key.length!==32)throw new ErroCadastro('Defina CREDENTIALS_MASTER_KEY (Base64 de 32 bytes) antes de salvar SMTP por escritório.',503); return key; };
function cifrar(valor:string) { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',chave(),iv); const out=Buffer.concat([c.update(valor,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),out]).toString('base64'); }
function decifrar(valor:string) { const b=Buffer.from(valor,'base64'), d=createDecipheriv('aes-256-gcm',chave(),b.subarray(0,12)); d.setAuthTag(b.subarray(12,28)); return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'); }
export function migrarOperacoesEscritorio(db:Banco) {
 const m='006-operacoes-por-escritorio'; if(db.prepare('SELECT 1 FROM migracoes_aplicadas WHERE chave=?').get(m))return;
 db.transaction(()=>{db.exec(`CREATE TABLE configuracoes_smtp_escritorio (
   escritorio_id INTEGER PRIMARY KEY REFERENCES escritorios(id) ON DELETE RESTRICT, ativo INTEGER NOT NULL DEFAULT 0,
   host TEXT NOT NULL DEFAULT '', porta INTEGER NOT NULL DEFAULT 587, secure INTEGER NOT NULL DEFAULT 0, usuario TEXT NOT NULL DEFAULT '', remetente TEXT NOT NULL DEFAULT '', senha_cifrada TEXT NOT NULL DEFAULT '', versao INTEGER NOT NULL DEFAULT 1, atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE TABLE execucoes_escritorio (id INTEGER PRIMARY KEY AUTOINCREMENT, escritorio_id INTEGER NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT, solicitada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, status TEXT NOT NULL CHECK(status IN ('solicitada','executando','concluida','falhou','cancelada')), detalhes_json TEXT NOT NULL DEFAULT '{}', iniciada_em TEXT NOT NULL DEFAULT (datetime('now')), concluida_em TEXT);
 CREATE INDEX idx_execucoes_escritorio ON execucoes_escritorio(escritorio_id,id DESC);
 ALTER TABLE envios_clientes ADD COLUMN escritorio_id INTEGER REFERENCES escritorios(id) ON DELETE RESTRICT;
 UPDATE envios_clientes SET escritorio_id=(SELECT escritorio_id FROM clientes c WHERE c.id=envios_clientes.cliente_id) WHERE escritorio_id IS NULL;
 CREATE INDEX idx_envios_escritorio_fila ON envios_clientes(escritorio_id,status,proxima_tentativa,id);`); db.prepare('INSERT INTO migracoes_aplicadas(chave) VALUES(?)').run(m); })();
}
export function smtpEscritorio(db:Banco,office:number):SmtpEscritorio|null { const r=db.prepare('SELECT * FROM configuracoes_smtp_escritorio WHERE escritorio_id=?').get(office) as any; if(!r||!r.ativo||!r.host||!r.remetente)return null; return {ativo:!!r.ativo,host:r.host,port:r.porta,secure:!!r.secure,user:r.usuario,password:r.senha_cifrada?decifrar(r.senha_cifrada):'',from:r.remetente}; }
export function vistaSmtpEscritorio(db:Banco,office:number):VistaSmtpEscritorio { const r=db.prepare('SELECT * FROM configuracoes_smtp_escritorio WHERE escritorio_id=?').get(office) as any; return {ativo:!!r?.ativo,host:r?.host||'',port:r?.porta||587,secure:!!r?.secure,user:r?.usuario||'',from:r?.remetente||'',temSenha:!!r?.senha_cifrada,versao:r?.versao||0}; }
export function salvarSmtpEscritorio(db:Banco,office:number,input:Partial<SmtpEscritorio>&{limparSenha?:boolean}) { const old= smtpEscritorio(db,office); const password=input.limparSenha?'':(input.password||old?.password||''); const ativo=!!input.ativo,host=(input.host||'').trim(),from=(input.from||'').trim(),port=Number(input.port||587); if(ativo&&(!host||!from))throw new ErroCadastro('Informe servidor SMTP e remetente para ativar o envio.',400); if(!Number.isInteger(port)||port<1||port>65535)throw new ErroCadastro('Porta SMTP inválida.',400); if(input.user?.trim()&&!password)throw new ErroCadastro('Informe a senha SMTP do usuário configurado.',400); const encrypted=password?cifrar(password):''; db.prepare(`INSERT INTO configuracoes_smtp_escritorio(escritorio_id,ativo,host,porta,secure,usuario,remetente,senha_cifrada,versao,atualizado_em) VALUES(?,?,?,?,?,?,?,?,1,datetime('now')) ON CONFLICT(escritorio_id) DO UPDATE SET ativo=excluded.ativo,host=excluded.host,porta=excluded.porta,secure=excluded.secure,usuario=excluded.usuario,remetente=excluded.remetente,senha_cifrada=excluded.senha_cifrada,versao=configuracoes_smtp_escritorio.versao+1,atualizado_em=datetime('now')`).run(office,Number(ativo),host,port,Number(!!input.secure),(input.user||'').trim(),from,encrypted); return vistaSmtpEscritorio(db,office); }
export function registrarExecucaoEscritorio(db:Banco,office:number,ator:number|null,detalhes:unknown) { return Number(db.prepare("INSERT INTO execucoes_escritorio(escritorio_id,solicitada_por,status,detalhes_json) VALUES (?,?,'solicitada',?)").run(office,ator,JSON.stringify(detalhes)).lastInsertRowid); }
