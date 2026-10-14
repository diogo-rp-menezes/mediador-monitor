// TODO: Replace each structure with a real domain component; track parity in UI_FUNCTIONAL_PARITY.md.
export const pending:Record<string,Array<{title:string;behavior:string;implementation:string}>>={
  monitoramento:[
    {title:'Consultas e coleta',behavior:'Selecionar uma consulta sindical e solicitar coleta; acompanhar fila e resultados.',implementation:'GET monitoramentos e POST /api/contexto/execucoes. Validar papel e filtros; atualizar lista somente após resposta da API.'},
    {title:'Agendas e limites',behavior:'Configurar intervalos ou dias, horário e fuso; definir limites da coleta.',implementation:'GET/PUT /api/contexto/agendas e /api/contexto/limites-monitoramento. Formulários em modal com validação dos schemas existentes.'},
    {title:'Execuções e recuperação',behavior:'Consultar andamento, solicitar cancelamento e recuperar execuções interrompidas.',implementation:'GET /api/contexto/execucoes; ações cancelar/recuperar por ID, justificativa e confirmação de consumidor encerrado. Polling cancelado ao trocar contexto.'}
  ],
  envios:[
    {title:'Fila de envios',behavior:'Filtrar destinatários, empresas e situações; conferir pendências antes do envio.',implementation:'Migrar contratos de envios em gestao-ui.js para componente tipado, tabela e resumo; a API continua responsável pelas transições de estado.'},
    {title:'Preparação e tentativas',behavior:'Preparar documentos aplicáveis, aprovar quando necessário e consultar falhas e tentativas.',implementation:'Integrar preparação por cliente/documento e detalhe da fila; recuperação exige as confirmações do backend, sem disparar SMTP no navegador.'}
  ],
  gestao:[],
  plataforma:[
    {title:'Escritórios e catálogo',behavior:'Gerenciar escritórios e catálogo compartilhado de sindicatos.',implementation:'CRUDs /api/plataforma com formulários tipados; atualizar contextos disponíveis após salvar escritório. Exclusões respeitam restrições do servidor.'},
    {title:'Inteligência artificial',behavior:'Configurar provedor/modelo, testar conexão e solicitar análise ou reanálise.',implementation:'Migrar /api/plataforma/ia, testar, solicitacoes e tentativas. Segredos ficam no servidor; revisão otimista das configurações preservada.'},
    {title:'Operações da plataforma',behavior:'Acompanhar coleta global, filas e recuperar tarefas interrompidas.',implementation:'Componentes por fila usando os handlers atuais, com justificativas, confirmação e histórico. Acesso exclusivo ao administrador da plataforma.'}
  ]
};
