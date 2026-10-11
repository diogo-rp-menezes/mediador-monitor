import ts from 'typescript';
import {mkdtempSync,readFileSync,readdirSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve('.'),destination=resolve(root,'dist');
if(destination!==join(root,'dist'))throw new Error('Destino de build inválido.');
const staging=mkdtempSync(join(tmpdir(),'mediador-build-'));
try{
  const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
  if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root,{outDir:staging});
  const program=ts.createProgram(parsed.fileNames,parsed.options),result=program.emit();
  const diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program),...result.diagnostics];
  if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1;}
  else{
    const files=[];
    function inventory(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())inventory(path);else if(path.endsWith('.js'))files.push(path);}}
    inventory(staging);
    const dependencies=new Map();
    for(const file of files){
      const imports=[],ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.ES2022,true);
      function inspect(node){
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
        if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))imports.push(node.arguments[0].text);
        ts.forEachChild(node,inspect);
      }
      inspect(ast);dependencies.set(file,imports);
    }
    function historical(file,seen=new Set()){
      if(seen.has(file))return false;seen.add(file);
      return (dependencies.get(file)||[]).some(specifier=>specifier==='better-sqlite3'||specifier==='node:sqlite'||specifier==='node-cron'||(specifier.startsWith('.')&&historical(resolve(dirname(file),specifier),seen)));
    }
    const selected=files.filter(file=>!historical(file));
    for(const required of ['server.js','local-cli.js','postgres-worker-cli.js','postgres-monitoring-worker-cli.js','postgres-ia-worker-cli.js','postgres-original-inventory-cli.js','postgres-backup-cli.js','postgres-runtime-role-cli.js','postgres-cli.js'])if(!selected.includes(join(staging,required)))throw new Error(`Entrada operacional contaminada pelo legado: ${required}`);
    // Only this fixed workspace build directory may be replaced. Sources and data are preserved.
    if(relative(root,destination)!=='dist')throw new Error('Destino fora do workspace.');
    rmSync(destination,{recursive:true,force:true});
    for(const file of selected){const target=join(destination,relative(staging,file));mkdirSync(dirname(target),{recursive:true});copyFileSync(file,target);}
    console.log(`Build operacional: ${selected.length} módulos; ${files.length-selected.length} módulos históricos excluídos.`);
  }
}finally{
  if(!staging.startsWith(resolve(tmpdir())+sep))throw new Error('Diretório temporário inválido.');
  rmSync(staging,{recursive:true,force:true});
}
