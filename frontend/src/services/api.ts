/** Transporte web isolado: futuros hosts desktop devem fornecer este contrato, sem acoplar telas ao IPC. */
export function createApiTransport(config:{csrf:()=>string;unauthorized:()=>void;fetch?:typeof fetch}){
  const send=config.fetch??globalThis.fetch.bind(globalThis);
  async function response(path:string,method:string,body:unknown,headers:Record<string,string>){
    const result=await send(path,{method,credentials:'same-origin',headers:{'content-type':'application/json',...(method==='GET'?{}:{'x-csrf-token':config.csrf()}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    if(result.status===401)config.unauthorized();
    if(!result.ok){let message='Não foi possível concluir a operação.';try{const data=await result.json();message=data.erro||message;}catch{}throw new Error(message);}
    return result;
  }
  return {
    async json<T>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}):Promise<T>{return (await response(path,method,body,headers)).json();},
    async file(path:string,headers:Record<string,string>={}){const result=await response(path,'GET',undefined,headers);return {blob:await result.blob(),type:result.headers.get('content-type')||''};}
  };
}
