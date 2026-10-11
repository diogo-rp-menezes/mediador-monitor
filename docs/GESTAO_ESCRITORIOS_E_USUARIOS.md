# Gestão de escritórios e usuários — S3-11 a S3-13

O administrador da plataforma cria, edita, inativa e exclui escritórios vazios em **Minha conta**. Exclusão não é permitida para o escritório inicial nem para escritórios com cadastros, vínculos, suporte, auditoria ou histórico. Para preservar dados, inative o escritório. Nome, CNPJ, e-mail e telefone são validados; estado de atividade só é gerenciado pela plataforma.

O administrador local edita nome, e-mail e telefone do escritório selecionado. CNPJ e atividade não são graváveis por uma conta local. O painel mostra contadores de clientes, documentos e consolidações próprias, o histórico contextual e o aviso de que execuções serão habilitadas na Sprint 4.

Em **Usuários e vínculos**, o administrador local pode cadastrar uma identidade global com credencial inicial ou vincular uma conta existente pelo e-mail. A senha/identidade existente não pode ser substituída ao vincular. O papel de funcionário (administrador ou operador) pertence ao escritório; representante é vinculado a uma empresa daquele mesmo escritório. Alterar ou revogar um vínculo não afeta outros escritórios. A última conta administradora ativa não pode ser removida ou rebaixada por uma operação local.

Todas as operações são auditadas com ator da sessão. O serviço nunca devolve hash de senha. O cadastro inicial requer uma senha forte informada pelo administrador; a entrega dessa credencial ao usuário é um passo operacional fora da aplicação. Convites e entrega automática de acesso por e-mail não estão implementados.
