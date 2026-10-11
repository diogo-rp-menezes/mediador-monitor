import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({sendMail:vi.fn(),close:vi.fn(),createTransport:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:mock.createTransport}}));
import {criarEntregaRecuperacaoPostgres} from '../src/postgres-recovery-mail.js';
const env={AUTH_SMTP_ENABLED:'1',AUTH_SMTP_HOST:'smtp.example.invalid',AUTH_SMTP_FROM:'conta@example.invalid',AUTH_SMTP_USER:'usuario',AUTH_SMTP_PASS:'segredo-ficticio'};
beforeEach(()=>{vi.clearAllMocks();mock.sendMail.mockResolvedValue({});mock.createTransport.mockReturnValue({sendMail:mock.sendMail,close:mock.close});});
it('desativa por padrão e recusa configuração parcial/insegura antes de criar transporte',()=>{
  expect(criarEntregaRecuperacaoPostgres('http://localhost:3000',{})).toBeUndefined();
  expect(()=>criarEntregaRecuperacaoPostgres('http://externo.example.invalid',env)).toThrow();
  expect(()=>criarEntregaRecuperacaoPostgres('https://app.example.invalid',{...env,AUTH_SMTP_PASS:''})).toThrow();
  expect(()=>criarEntregaRecuperacaoPostgres('https://app.example.invalid',{...env,AUTH_SMTP_PORT:'0'})).toThrow();
  expect(mock.createTransport).not.toHaveBeenCalled();
});
it('envia link por fragmento com TLS obrigatório, destinatário explícito e fecha transporte',async()=>{
  const token='a'.repeat(43),send=criarEntregaRecuperacaoPostgres('https://app.example.invalid',env)!;
  await send('cliente@example.invalid',token);
  expect(mock.createTransport).toHaveBeenCalledWith(expect.objectContaining({secure:false,requireTLS:true,tls:{rejectUnauthorized:true},connectionTimeout:10000}));
  expect(mock.sendMail).toHaveBeenCalledWith(expect.objectContaining({to:'cliente@example.invalid',text:expect.stringContaining(`https://app.example.invalid/login#recuperar=${token}`),disableFileAccess:true,disableUrlAccess:true}));
  expect(JSON.stringify(mock.sendMail.mock.calls)).not.toContain(env.AUTH_SMTP_PASS);expect(mock.close).toHaveBeenCalledOnce();
});
it('oculta erros do provedor e fecha transporte; token inválido não inicia conexão',async()=>{
  const send=criarEntregaRecuperacaoPostgres('http://localhost:3000',env)!;
  await expect(send('cliente@example.invalid','invalid')).rejects.toThrow();expect(mock.createTransport).not.toHaveBeenCalled();
  mock.sendMail.mockRejectedValue(new Error('senha e token no erro remoto'));
  await expect(send('cliente@example.invalid','b'.repeat(43))).rejects.toThrow('Entrega de recuperação indisponível.');expect(mock.close).toHaveBeenCalledOnce();
});
