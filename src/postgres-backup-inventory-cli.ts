import {writeFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {criarPoolPostgresRuntime} from './postgres.js';
import {validarPapelRuntimePostgres} from './postgres-runtime-safety.js';
import {lerReferenciasBackupPostgres,inventariarArquivosBackup} from './postgres-backup-inventory.js';

let pool:ReturnType<typeof criarPoolPostgresRuntime>|undefined;
try{
  let output:string|undefined,dump:string|undefined;const roots:string[]=[],args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value||value.startsWith('--'))throw new Error();if(args[i]==='--output'&&!output)output=value;else if(args[i]==='--dump'&&!dump)dump=value;else if(args[i]==='--root')roots.push(value);else throw new Error();}
  if(!output||!dump||!roots.length)throw new Error();
  const stat=await lstat(dump);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1)throw new Error();
  pool=criarPoolPostgresRuntime();await validarPapelRuntimePostgres(pool);
  const inventory=await inventariarArquivosBackup(await lerReferenciasBackupPostgres(pool),roots);
  await writeFile(output,JSON.stringify([{source:resolve(dump),path:'database/main.dump'},...inventory.files],null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(`Inventário privado criado: dump e ${inventory.arquivos} arquivo(s) referenciado(s), sem alterar a origem.`);
}catch{console.error('Inventário não concluído. Uso: postgres:backup:inventariar -- --dump arquivo.dump --root pasta-permitida [--root outra-pasta] --output novo-inventario.json. Confira banco, arquivos, hashes e permissões.');process.exitCode=1;}
finally{await pool?.end();}

