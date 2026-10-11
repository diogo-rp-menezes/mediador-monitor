# ADR-002: operações persistidas por escritório

## Decisão

O monólito mantém a fila de e-mails e as solicitações de monitoramento no SQLite, sempre com `escritorio_id` imutável. O consumidor deriva a credencial SMTP da mesma chave antes do envio e revalida empresa, destinatário, aprovação e versão.

Credenciais SMTP ficam na tabela `configuracoes_smtp_escritorio` cifradas com AES-256-GCM. A chave `CREDENTIALS_MASTER_KEY` é uma variável de ambiente Base64 de 32 bytes e não é armazenada no banco. A API retorna apenas `temSenha` e a versão da configuração.

## Consequências

Uma troca de credencial incrementa a versão e a próxima execução usa somente a nova configuração. A chave deve ser mantida no gerenciador de segredos da instalação; para rotacioná-la, configure a nova chave, recifre cada configuração em uma manutenção controlada e só então descarte a anterior. Sem chave válida, a gravação de SMTP é recusada.

O SMTP global legado continua restrito ao escritório inicial durante a transição de instalações existentes. Ele atende alertas da plataforma e deve ser migrado para a configuração contextual antes de centralizar a operação.
