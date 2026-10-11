import {it,expect} from 'vitest';
import type {IncomingMessage} from 'node:http';
import {criarResolvedorIp} from '../src/request-ip.js';
function req(socket:string,header?:string|string[],rawHeaders:string[]=[]){return {socket:{remoteAddress:socket},headers:{'x-forwarded-for':header},rawHeaders} as unknown as IncomingMessage;}
it('usa socket por padrão e ignora cabeçalho de conexão não confiável',()=>{
  expect(criarResolvedorIp()(req('127.0.0.1','192.0.2.1'))).toBe('127.0.0.1');
  expect(criarResolvedorIp('10.0.0.0/8')(req('192.0.2.2','198.51.100.3'))).toBe('192.0.2.2');
});
it('percorre cadeia da direita até o primeiro endereço não confiável, descartando IP forjado à esquerda',()=>{
  const resolve=criarResolvedorIp('10.0.0.0/8,192.168.0.0/16');
  expect(resolve(req('10.1.1.1','203.0.113.99, 198.51.100.8, 192.168.1.2'))).toBe('198.51.100.8');
  expect(resolve(req('10.1.1.1','198.51.100.8'))).toBe('198.51.100.8');
});
it('confere IPv6, CIDR e socket IPv4 mapeado sem confiar em toda a rede cliente',()=>{
  expect(criarResolvedorIp('10.0.0.0/8')(req('::ffff:10.1.1.1','2001:db8:2::7'))).toBe('2001:db8:2::7');
  const resolve=criarResolvedorIp('2001:db8:1::/64');
  expect(resolve(req('2001:db8:1::2','198.51.100.8,2001:db8:1::3'))).toBe('198.51.100.8');
  expect(resolve(req('2001:db8:2::2','198.51.100.8'))).toBe('2001:db8:2::2');
});
it('cabeçalhos malformados, repetidos ou excessivos retornam ao socket',()=>{
  const resolve=criarResolvedorIp('127.0.0.1');
  for(const header of ['unknown','198.51.100.1:80','[2001:db8::1]','fe80::1%eth0','198.51.100.1,',Array(33).fill('198.51.100.1').join(','),'x'.repeat(4097),['198.51.100.1']])
    expect(resolve(req('127.0.0.1',header))).toBe('127.0.0.1');
  expect(resolve(req('127.0.0.1','198.51.100.1',['X-Forwarded-For','198.51.100.1','x-forwarded-for','192.0.2.1']))).toBe('127.0.0.1');
});
it('rejeita configuração ambígua em vez de ampliar confiança',()=>{
  for(const config of ['localhost','127.0.0.1,','10.0.0.0/33','::1/129','10.0.0.0/-1','10.0.0.0/08','10.0.0.0/8/1','fe80::1%eth0'])
    expect(()=>criarResolvedorIp(config)).toThrow();
});
