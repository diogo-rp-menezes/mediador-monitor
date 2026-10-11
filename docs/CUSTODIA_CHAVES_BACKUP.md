# Cópia de recuperação das chaves

`backup:chaves` cria uma cópia cifrada de `BACKUP_ENCRYPTION_KEY` e `CREDENTIALS_MASTER_KEY`, protegida por `BACKUP_RECOVERY_KEY`. As três chaves devem ser distintas, aleatórias e ter 32 bytes em base64. A ferramenta não gera nem ativa chaves automaticamente e não altera `.env.docker`.

O formato `mediador-chaves-backup-v1` usa AES-256-GCM com IV aleatório de 12 bytes, tag de 16 bytes e identificador do formato autenticado. O arquivo cifrado não inclui a chave de recuperação nem chaves em claro. Versão desconhecida, adulteração, chave errada e conteúdo inválido são recusados com erro genérico.

Configure as variáveis por um ambiente privado; com as três chaves já fornecidas:

```powershell
npm run backup:chaves -- criar --output C:\pasta-privada-separada\chaves.enc
```

Guarde esse arquivo separado dos backups de dados e do servidor. Guarde `BACKUP_RECOVERY_KEY` em outro local privado, fora de ambos, com acesso e recuperação sob responsabilidade do operador. Uma pasta diferente no mesmo computador ajuda na organização, mas não protege contra perda do computador. A ferramenta não implementa essa custódia física nem garante disponibilidade do local escolhido.

Para recuperar, forneça somente `BACKUP_RECOVERY_KEY` no ambiente e execute:

```powershell
npm run backup:chaves -- recuperar --input C:\pasta-privada-separada\chaves.enc --output C:\pasta-privada\chaves-recuperadas.json
```

**O JSON recuperado contém as duas chaves em claro.** Use uma pasta privada com ACLs apropriadas no Windows; `mode 0600` não substitui essas permissões. A ferramenta não imprime as chaves nem as ativa na aplicação. O operador deve conferir a versão compatível do backup e aplicar os valores no ambiente de recuperação. Após conferir a restauração, trate o arquivo em claro conforme a política de segredos. A exclusão normal não garante apagamento seguro.

Os destinos devem ser inexistentes; a ferramenta não sobrescreve arquivos. Entradas devem ser arquivos regulares e pequenos. Não guarde esse JSON em relatórios, versionamento ou pastas compartilhadas. Alterar qualquer chave não atualiza cópias anteriores; preserve a associação entre backup, cópia cifrada de chaves e chave de recuperação correspondente. A perda da terceira chave impede recuperar as duas primeiras por essa cópia.

## Validação local

Quatro testes de módulo/CLI cobrem recuperação, aleatoriedade, três chaves distintas, adulteração, formato desconhecido, chave errada, ausência de segredos nas saídas e recusa de sobrescrita. Build e suíte geral de 421 testes em 87 arquivos passaram em 09/10/2026.

O ensaio `test:postgres-backup-cifrado`, também executado por `test:postgres-recuperacao-limpa`, cria uma cópia cifrada de chaves em pasta temporária separada. Zera os buffers originais e remove a chave da aplicação do ambiente do teste; recupera as duas chaves da cópia antes de recuperar o dump e os arquivos. Login, SMTP, IA e monitoramento restaurados continuam funcionando. A terceira chave fica em memória durante esse ensaio. Limpeza de buffers não promete apagar todas as cópias internas de strings do JavaScript.

Nenhuma chave operacional foi copiada, alterada ou persistida por esses testes. Eles validam o mecanismo técnico, não a guarda/recuperação humana da terceira chave, retenção, pacote integral, remapeamento de caminhos ou conciliação de mensagens externas. S6-10 e S7-03 continuam parciais.
