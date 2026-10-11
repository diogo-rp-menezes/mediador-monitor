import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';

it('servidor e workers não carregam driver SQLite pelo grafo de imports',()=>{
  const visited=new Set<string>(),violations:string[]=[];
  function visit(file:string,chain:string[]){
    if(visited.has(file))return;visited.add(file);
    const compiled=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const ast=ts.createSourceFile(file,compiled,ts.ScriptTarget.ES2022,true);
    function inspect(node:ts.Node){
      let specifier:string|undefined;
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specifier=node.moduleSpecifier.text;
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))specifier=node.arguments[0].text;
      if(specifier==='better-sqlite3')violations.push([...chain,file,specifier].join(' -> '));
      if(specifier?.startsWith('.'))visit(resolve(dirname(file),specifier.replace(/\.js$/,'.ts')),[...chain,file]);
      ts.forEachChild(node,inspect);
    }
    inspect(ast);
  }
  for(const entry of ['server.ts','postgres-worker-cli.ts','postgres-preparation-cli.ts','postgres-monitoring-worker-cli.ts','postgres-monitoring-scheduler-cli.ts','postgres-ia-worker-cli.ts','postgres-original-inventory-cli.ts','postgres-backup-cli.ts'])visit(resolve('src',entry),[]);
  expect(violations).toEqual([]);
});
