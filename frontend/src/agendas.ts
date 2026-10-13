export type Weekly={dias:number[];horario:string;fuso:string};
export type Agenda={monitoramento_id:number;nome:string;monitoramento_ativo:boolean;ativa:boolean;intervalo_minutos:number;semanal:Weekly|null};
export function agendaIssue(interval:number,weekly:Weekly|null){
  if(!Number.isInteger(interval)||interval<60||interval>10080)return 'Informe um intervalo inteiro entre 60 e 10080 minutos.';
  if(!weekly)return '';
  if(!weekly.dias.length||weekly.dias.some(day=>!Number.isInteger(day)||day<0||day>6))return 'Selecione pelo menos um dia da semana.';
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(weekly.horario))return 'Informe um horário válido.';
  try{new Intl.DateTimeFormat('pt-BR',{timeZone:weekly.fuso});}catch{return 'Informe um fuso horário válido.';}
  if(!weekly.fuso.trim())return 'Informe um fuso horário válido.';
  return '';
}
/** Calendar occurrence, not a promise that a scheduler/worker will run. Handles DST through Intl. */
export function nextWeekly(weekly:Weekly,now:Date):Date|null{
  if(agendaIssue(60,weekly))return null;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:weekly.fuso,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  for(let minute=Math.floor(now.getTime()/60000)+1,end=minute+8*1440;minute<end;minute++){
    const date=new Date(minute*60000),parts=formatter.formatToParts(date),part=(name:string)=>parts.find(value=>value.type===name)!.value;
    if(`${part('hour')}:${part('minute')}`!==weekly.horario)continue;
    if(weekly.dias.includes(new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`).getUTCDay()))return date;
  }
  return null;
}
