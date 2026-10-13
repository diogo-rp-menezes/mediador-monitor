import {afterEach,describe,expect,it,vi} from 'vitest';
import {createCancelablePolling} from '../frontend/src/services/polling';
afterEach(()=>vi.useRealTimers());
describe('contextual polling',()=>{
  it('serializes requests and retries after errors',async()=>{
    vi.useFakeTimers();let release!:(v:number)=>void;
    const load=vi.fn().mockImplementationOnce(()=>new Promise<number>(resolve=>{release=resolve;})).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(3);
    const data=vi.fn(),error=vi.fn();const polling=createCancelablePolling({load,data,error,busy:vi.fn(),interval:100});
    const first=polling.refresh();await polling.refresh();expect(load).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(500);expect(load).toHaveBeenCalledTimes(1);
    release(1);await first;await vi.advanceTimersByTimeAsync(200);expect(data.mock.calls).toEqual([[1],[3]]);expect(error).toHaveBeenCalledOnce();polling.stop();
  });
  it('aborts on stop and rejects a late transport response',async()=>{
    vi.useFakeTimers();let release!:(v:string)=>void;let signal!:AbortSignal;
    const load=vi.fn((s:AbortSignal)=>{signal=s;return new Promise<string>(resolve=>{release=resolve;});});const data=vi.fn(),error=vi.fn();
    const polling=createCancelablePolling({load,data,error,busy:vi.fn(),interval:100});const first=polling.refresh();polling.stop();expect(signal.aborted).toBe(true);release('old office');await first;await vi.advanceTimersByTimeAsync(500);expect(data).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(load).toHaveBeenCalledOnce();
  });
  it('pause cancels work; resume cannot be overwritten by the paused request',async()=>{
    vi.useFakeTimers();let release!:(v:string)=>void;const load=vi.fn().mockImplementationOnce(()=>new Promise<string>(resolve=>{release=resolve;})).mockResolvedValue('current');const data=vi.fn();
    const polling=createCancelablePolling({load,data,error:vi.fn(),busy:vi.fn(),interval:100});const first=polling.refresh();polling.pause();await vi.advanceTimersByTimeAsync(500);expect(load).toHaveBeenCalledOnce();polling.resume();await Promise.resolve();release('obsolete');await first;expect(data.mock.calls).toEqual([['current']]);polling.stop();
  });
});
