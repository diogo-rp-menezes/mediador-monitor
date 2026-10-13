/** A single request at a time; stop also invalidates transports that ignore abort. */
export function createCancelablePolling<T>(options:{load:(signal:AbortSignal)=>Promise<T>;data:(value:T)=>void;error:(cause:unknown)=>void;busy:(value:boolean)=>void;interval?:number}){
  let stopped=false,automatic=true,generation=0,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  function clear(){clearTimeout(timer);timer=undefined;}
  async function refresh(){
    if(stopped||controller)return;
    clear();const current=++generation;const request=new AbortController();controller=request;options.busy(true);
    try{const value=await options.load(request.signal);if(!stopped&&current===generation)options.data(value);}
    catch(cause){if(!stopped&&current===generation&&!request.signal.aborted)options.error(cause);}
    finally{if(!stopped&&current===generation){controller=undefined;options.busy(false);if(automatic)timer=setTimeout(()=>{void refresh();},options.interval??10000);}}
  }
  function pause(){automatic=false;clear();generation++;controller?.abort();controller=undefined;if(!stopped)options.busy(false);}
  function resume(){if(stopped)return;automatic=true;void refresh();}
  function stop(){pause();stopped=true;}
  return {refresh,pause,resume,stop};
}
