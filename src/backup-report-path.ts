import {resolve,relative,isAbsolute} from 'node:path';

/** Reports must not add an unauthenticated file inside the encrypted package. */
export function validarRelatorioForaDoPacote(output:string,report:string){
  const root=resolve(output),target=resolve(report),path=relative(root,target);
  if(path===''||(!isAbsolute(path)&&path!=='..'&&!path.startsWith('..\\')&&!path.startsWith('../'))){
    throw new Error('Relatório deve ficar fora da pasta do pacote.');
  }
}
