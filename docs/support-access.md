# Acesso de suporte

SUPPORT não consulta lista geral nem detalhe irrestrito de tenants. Um SUPER_ADMIN recentemente autenticado autoriza uma sessão de 15 minutos, indicando operador, tenant e motivo (mínimo 10 caracteres). O operador vê apenas as suas sessões ativas; ao abrir, a UI mostra permanentemente “Modo de Suporte” e o nome da empresa junto do diagnóstico.

A superfície é separada e apenas de leitura: identidade/status e uso. Não assume utilizador, não expõe passwords, não concede exportação de dados. GET /platform/support-sessions/:id valida operador, estado e prazo em cada acesso. O frontend retira o diagnóstico ao expirar. Encerrar regista SUPPORT_SESSION_ENDED; o worker regista expiração. Criar sessão produz SUPPORT_SESSION_STARTED. Revogar PlatformUser invalida o acesso imediatamente.
