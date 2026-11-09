# Checklist de lançamento

Preencher com responsável, evidência e data. Não marcar por inferência.

- [ ] DNS e origem pública corretos; staging em domínio separado.
- [ ] TLS válido, renovação automática, HSTS e redireção HTTPS.
- [ ] PostgreSQL dedicado, TLS/rede privada, mínimo privilégio, capacidade e alarmes.
- [ ] Redis dedicado autenticado, privado, persistência/monitorização adequadas.
- [ ] Storage persistente, permissões UID 1000, capacidade, snapshots/versioning e retenção.
- [ ] Backups cifrados e externos; arquivamento WAL/PITR medido.
- [ ] Restore isolado concluído com documentos, RPO/RTO e evidência.
- [ ] Segredos únicos por ambiente, rotação e recuperação testadas; nenhum segredo no Git.
- [ ] SMTP real testado, SPF/DKIM/DMARC, remetente e contacto comercial válidos.
- [ ] Origem CORS exata; CSRF, cookies Secure/HttpOnly/SameSite e proxy confiável restrito.
- [ ] Headers de segurança e rate limits verificados através do ingresso real.
- [ ] Logs sem tokens/passwords; retenção, pesquisa por requestId e proteção de dados pessoais.
- [ ] Coletor de erros e alertas configurado; acesso restrito às métricas.
- [ ] Filas/worker monitorizados, retries/stalled jobs/atraso de outbox e armazenamento alarmados.
- [ ] Migrations aplicadas, sem seed demo em produção, rollback compatível aprovado.
- [ ] Staging independente passou smoke login/dashboard/obra/read path.
- [ ] CI do SHA exato verde, imagens imutáveis aprovadas; produção com aprovação manual.
- [ ] Super Admin criado por processo seguro; acesso mínimo e proteção adicional/MFA no ingresso.
- [ ] Suporte autorizado com motivo, banner, expiração e trilho auditável testados.
- [ ] Termos/privacidade publicados e versionados; contactos de suporte/comercial definidos.
- [ ] Quotas, direitos, suspensão, portabilidade e cobranças manuais confirmados comercialmente.

## Gates AWS do piloto (todos requerem evidência externa)

- [ ] Contas/SSO autorizados, tags de custo ativas e budget aprovado.
- [ ] DNS delegado, ACM regional/global validado, ALB restrito, WAF testado com upload legítimo.
- [ ] ECR imutável e scans aprovados, tasks ECS privadas e circuit breaker ensaiado.
- [ ] S3 privado/versionado e restauro de objeto, Secrets Manager/KMS e rotação.
- [ ] PITR RDS, snapshot pré-migration arriscada, restore isolado e integridade financeira.
- [ ] SES com DKIM/SPF/DMARC, fora do sandbox e bounce/complaint verificados.
- [ ] OIDC e reviewers reais; staging passou; autorização de produção independente.
- [ ] CloudTrail, CloudWatch, SNS confirmado, synthetic e alarmes testados.
- [ ] Admin convidado e verificado, tenant piloto, UAT, suporte, contactos e links legais.
- [ ] Rollback exercitado, resposta a incidente e janela de observação atribuídos.
