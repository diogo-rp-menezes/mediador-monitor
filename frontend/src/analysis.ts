export type AnalysisField={id:string;rotulo:string;valor?:unknown;clausula?:string;citacao?:string;acao?:string};
export type AnalysisSection={titulo:string;grupos:Array<{titulo:string|null;campos:AnalysisField[]}>};
export type AnalysisView={versao?:string;secoes?:AnalysisSection[];itens?:Array<{id:string;titulo:string;resumo?:string;clausula?:string;citacao?:string}>;aditivo?:boolean;alteracoes?:Array<{campo:string;acao:string;valor?:string;clausula?:string;citacao?:string}>;observacoes?:string[]};
export function hasAnalysisValue(value:unknown):boolean{
  if(value===null||value===undefined)return false;
  if(typeof value==='string')return !!value.trim()&&value.trim().toLocaleLowerCase('pt-BR')!=='não consta na cct';
  if(Array.isArray(value))return value.some(hasAnalysisValue);
  if(typeof value==='object')return Object.values(value).some(hasAnalysisValue);
  return true;
}
export function analysisSections(view?:AnalysisView|null,analysis?:unknown):AnalysisSection[]{
  if(view?.secoes?.length)return view.secoes;
  if(view?.aditivo)return [{titulo:'Alterações do aditivo',grupos:[{titulo:null,campos:(view.alteracoes??[]).map((item,index)=>({id:String(index),rotulo:item.campo,valor:item.valor,acao:item.acao,clausula:item.clausula,citacao:item.citacao}))}]}];
  if(view?.itens?.length){
    // An unrecognized saved format may receive an empty historical view from the API.
    // Preserve the saved values through the existing generic reader in that case.
    if(!view.itens.some(item=>hasAnalysisValue(item.resumo))&&hasAnalysisValue(analysis))return [];
    return [{titulo:'Tópicos da análise',grupos:[{titulo:null,campos:view.itens.map(item=>({id:item.id,rotulo:item.titulo,valor:item.resumo,clausula:item.clausula,citacao:item.citacao}))}]}];
  }
  return [];
}
