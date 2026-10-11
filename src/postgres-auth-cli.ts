import { createInterface } from 'node:readline/promises';
import { criarPoolPostgres } from './postgres.js';
import { bootstrapAdministradorPostgres } from './postgres-papeis.js';

async function lerSenha():Promise<string>{
  if(!process.stdin.isTTY||!process.stdout.isTTY){
    const password=process.env.AUTH_BOOTSTRAP_PASSWORD;
    delete process.env.AUTH_BOOTSTRAP_PASSWORD;
    if(password)return password;
    throw new Error('Use um terminal interativo ou defina AUTH_BOOTSTRAP_PASSWORD para execução não interativa.');
  }
  process.stdout.write('Senha (mínimo de 15 caracteres; entrada oculta): ');
  const wasRaw=process.stdin.isRaw;process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  const read=()=>new Promise<string>((resolve,reject)=>{
    let value='';
    const finish=(error?:Error)=>{process.stdin.off('data',receive);process.stdin.setRawMode(!!wasRaw);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
    const receive=(chunk:string)=>{for(const char of chunk){
      if(char==='\u0003')return finish(new Error('Operação cancelada.'));
      if(char==='\r'||char==='\n')return finish();
      if(char==='\u007f'||char==='\b')value=[...value].slice(0,-1).join('');else if(char>=' ')value+=char;
    }};
    process.stdin.on('data',receive);
  });
  const first=await read();process.stdout.write('Confirme a senha: ');const second=await read();
  if(first!==second)throw new Error('As senhas precisam ser iguais.');
  return first;
}

const args=process.argv.slice(2);
const value=(flag:string)=>{const i=args.indexOf(flag);return i<0?'':args[i+1]??'';};
try{
  const allowed=new Set(['--nome','--email']);
  if(args.some((arg,index)=>arg.startsWith('--')&&!allowed.has(arg))||args.some((arg,index)=>!arg.startsWith('--')&&(index===0||args[index-1]!=='--nome'&&args[index-1]!=='--email')))
    throw new Error('Uso: npm run postgres:auth:bootstrap -- --nome "Nome" --email "email@exemplo.com"');
  let nome=value('--nome'),email=value('--email');
  if((!nome||!email)&&!process.stdin.isTTY)throw new Error('Informe --nome e --email.');
  if(!nome||!email){const prompt=createInterface({input:process.stdin,output:process.stdout});try{nome ||= await prompt.question('Nome: ');email ||= await prompt.question('E-mail: ');}finally{prompt.close();}}
  const senha=await lerSenha();
  const pool=criarPoolPostgres();
  try{
    const current=await pool.query<{user:string}>('SELECT current_user AS user');
    if(current.rows[0]?.user!==(process.env.PGUSER||'mediador'))
      throw new Error('Bootstrap exige que a conexão corresponda a PGUSER administrativo.');
    if(current.rows[0]?.user===process.env.PGAPPUSER)
      throw new Error('Bootstrap deve usar PGUSER administrativo, não PGAPPUSER.');
    const id=await bootstrapAdministradorPostgres(pool,{nome,email,senha});
    console.log(`Administrador PostgreSQL inicial criado (id ${id}). Inicie o painel em modo PostgreSQL e entre com o e-mail informado.`);
  }finally{await pool.end();delete process.env.AUTH_BOOTSTRAP_PASSWORD;}
}catch(error){
  console.error(error instanceof Error&&error.name!=='ZodError'?error.message:'Confira nome, e-mail e senha (mínimo de 15 caracteres).');
  process.exitCode=1;
}

