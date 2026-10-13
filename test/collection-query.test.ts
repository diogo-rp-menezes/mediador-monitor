import {expect,it} from 'vitest';
import {collectionQueryIssue,type CollectionQuery} from '../frontend/src/monitoring';
const query:CollectionQuery={id:1,nome:'Consulta',ativo:true,cnpj_filtro:'',categoria:'Comércio',titulo:'',uf:'DF',vigencia:'Vigentes',tipos:['Convenção Coletiva']};
it('recusa ausência, inativa e consulta sem identificação',()=>{expect(collectionQueryIssue(undefined)).not.toBe('');expect(collectionQueryIssue({...query,ativo:false})).not.toBe('');expect(collectionQueryIssue({...query,categoria:' '})).not.toBe('');});
it('recusa tipos ausentes ou desconhecidos e UF incompatível',()=>{for(const tipos of [[],['Tipo inventado']])expect(collectionQueryIssue({...query,tipos})).not.toBe('');expect(collectionQueryIssue({...query,uf:'Distrito Federal'})).not.toBe('');});
it('vigência anual não é uma opção do formulário MTE',()=>{expect(collectionQueryIssue({...query,vigencia:'2026'})).toContain('Vigentes, Todos ou Não Vigentes');});
it('aceita opções e aliases de vigência consumidos pelo worker',()=>{for(const vigencia of ['','Vigentes','vigente','Todos','Não Vigentes','nao vigente','0','1','2'])expect(collectionQueryIssue({...query,vigencia})).toBe('');});
