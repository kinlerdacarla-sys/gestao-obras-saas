# Preparação de produção

Preparação técnica não equivale a autorização de lançamento. Não foi feito deploy de produção. Configuração release: `infrastructure/docker/compose.release.yml`, exemplo sem segredos em `release.env.example`. Staging e produção usam projetos Compose, volumes, DB, Redis e segredos independentes. HTTPS termina num proxy configurado pelo operador; somente a Web é publicada em loopback por defeito.

`configuration()` falha no arranque de API/worker em NODE_ENV=production sem APP_ENV staging/production, DB/Redis autenticados, JWT aleatório (48+ caracteres), chave AES independente (64 hex), origem HTTPS exata, paths absolutos persistentes, SMTP/remetente, contacto e documentos legais publicados. Erros enumeram nomes de variáveis, nunca valores. TRUST_PROXY=false por defeito; apenas IP/CIDR explícitos, nunca true, número de saltos ou rede /0. Cada ambiente deve usar credenciais diferentes; a validação local não consegue comparar segredos com um ambiente remoto.

Cookies Secure/HttpOnly, CSRF por Origin, CORS exato, Helmet na API, headers de segurança Web, IDs de request gerados no servidor. TLS/HSTS no ingresso. Logs HTTP apenas metadados permitidos: requestId, tenantId, userId, projectId validado, ambiente/release. Exceções e falhas de filas não incluem mensagens arbitrárias nem payloads. Integrar stdout/stderr com o coletor escolhido; métricas /platform/metrics exigem Super Admin.

`/health/live`: processo. `/health/ready`: PostgreSQL e Redis. Worker ready verifica DB/Redis e consumidores ativos. Acesso de escrita aos volumes e entrega SMTP devem integrar o smoke operacional, além dos health checks. Error tracking externo, DNS, certificado, email real e alertas de monitorização requerem credenciais/infraestrutura do operador.
