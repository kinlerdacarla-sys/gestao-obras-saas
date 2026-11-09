# Produção
Estado: CONFIGURED em código; **não implantada**. Usar outra conta/perfil, zona/subdomínios, chaves, VPC, storage e state. Rever alterações da configuração com plano contra a conta real antes de aprovação.

Obrigatórios: aprovação de orçamento e DNS, aprovação do SES fora de sandbox, SNS confirmado, integração de alarmes, restore/PITR verificados, evidência de staging do mesmo SHA, ausência de falhas críticas, responsável por rollback. Configurar GitHub Environment production com reviewers obrigatórios, sem self-review nem bypass administrativo. A entrega não configura estes controlos na conta GitHub.

A operação migra uma vez, promove os mesmos digests e executa smoke de leitura. Não executar seed de demonstração. O catálogo técnico é criado pelas migrations. Bootstrap de operador: usar task API isolada na rede privada com comando node dist/scripts/bootstrap-platform.js e overrides PLATFORM_BOOTSTRAP_NAME, PLATFORM_BOOTSTRAP_EMAIL e PLATFORM_BOOTSTRAP_REASON. O worker envia convite de uso único (1 h); verificar endereço, definir password e autenticar em /platform/login. Não há password inicial nem membership de tenant.

JWT: retirar tráfego de mutações, atualizar secret aleatório do ambiente e reciclar API/worker de forma coordenada; revogar sessões existentes e testar reautenticação. A rotação AES deve esperar a entrega/invalidação de convites pendentes cifrados; não destruir a chave antiga prematuramente. Testar procedimentos em staging. Em incidente preservar logs antes de revogar chaves.

Após promoção, observar por 30 minutos: login, 5xx, latência, tasks, filas, S3, PostgreSQL e Redis. Suspender promoção ou reverter se houver perda de isolamento, inconsistência financeira ou falha de readiness. O operador regista a decisão; não há janela de espera automática neste repositório.
