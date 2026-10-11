import { createInterface } from 'node:readline/promises';
import { env } from './config.js';
import { openDb } from './db.js';
import { auditarSeguranca, bootstrapAdministrador, definirCredencial } from './autenticacao.js';

async function lerSenha(variavel: 'AUTH_BOOTSTRAP_PASSWORD' | 'AUTH_RESET_PASSWORD'): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (process.env[variavel]) return process.env[variavel]!;
    throw new Error(`Use um terminal interativo para informar a senha. Execução não interativa exige ${variavel}.`);
  }
  process.stdout.write('Senha (mínimo de 15 caracteres; entrada oculta): ');
  const rawAnterior = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return await new Promise<string>((resolve, reject) => {
    let valor = '';
    const fim = (erro?: Error) => {
      process.stdin.off('data', receber); process.stdin.setRawMode(!!rawAnterior); process.stdin.pause();
      process.stdout.write('\n'); erro ? reject(erro) : resolve(valor);
    };
    const receber = (dados: string) => {
      for (const char of dados) {
        if (char === '\u0003') return fim(new Error('Operação cancelada.'));
        if (char === '\r' || char === '\n') return fim();
        if (char === '\u007f' || char === '\b') valor = [...valor].slice(0, -1).join('');
        else if (char >= ' ') valor += char;
      }
    };
    process.stdin.on('data', receber);
  });
}

const [comando, ...args] = process.argv.slice(2);
try {
  if (comando !== 'bootstrap' && comando !== 'redefinir') throw new Error('Uso: npm run auth:bootstrap ou npm run auth:redefinir -- --email "seu@email"');
  const valor = (flag: string) => { const idx = args.indexOf(flag); return idx < 0 ? '' : args[idx + 1] ?? ''; };
  let nome = valor('--nome'), email = valor('--email');
  if ((!email || (comando === 'bootstrap' && !nome)) && !process.stdin.isTTY) throw new Error('Informe --email e, no bootstrap, --nome.');
  if (!email || (comando === 'bootstrap' && !nome)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { if (comando === 'bootstrap') nome ||= await rl.question('Nome: '); email ||= await rl.question('E-mail: '); } finally { rl.close(); }
  }
  const variavel = comando === 'bootstrap' ? 'AUTH_BOOTSTRAP_PASSWORD' : 'AUTH_RESET_PASSWORD';
  const senha = await lerSenha(variavel);
  if (process.stdin.isTTY && process.stdout.isTTY && senha !== await lerSenha(variavel)) throw new Error('As senhas precisam ser iguais.');
  const db = openDb(env.dbPath);
  try {
    if (comando === 'bootstrap') {
      await bootstrapAdministrador(db, { nome, email, senha });
      console.log('Administrador inicial criado. Inicie o painel e entre com o e-mail informado.');
    } else {
      const usuario = db.prepare('SELECT id FROM usuarios WHERE email=?').get(email.trim().toLowerCase()) as { id: number } | undefined;
      if (!usuario) throw new Error('Usuário não encontrado.');
      await definirCredencial(db, usuario.id, senha);
      auditarSeguranca(db, 'SENHA_REDEFINIDA_LOCALMENTE', null, {}, { origem: 'cli_local', usuario_alvo_id: usuario.id });
      console.log('Senha redefinida. Sessões anteriores e tokens de recuperação foram revogados.');
    }
  } finally { db.close(); delete process.env.AUTH_BOOTSTRAP_PASSWORD; delete process.env.AUTH_RESET_PASSWORD; }
} catch (erro) {
  // Não imprimir entradas ou exceções de validação que possam conter dados sensíveis.
  console.error(erro instanceof Error && erro.name !== 'ZodError' ? erro.message : 'Confira nome, e-mail e senha (mínimo de 15 caracteres).');
  process.exitCode = 1;
}
