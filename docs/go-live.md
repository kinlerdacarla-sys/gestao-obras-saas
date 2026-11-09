# Gate de entrada em piloto
Executar python infrastructure/release/go-live.py --sha <SHA> --evidence <ficheiro-privado>. Cada chave em checks contém status (PASS/FAIL/WARNING/MANUAL), evidence, verified_by, verified_at e sha. O script devolve código não zero se faltar evidência correspondente ao SHA ou existir um check por aprovar. Nunca criar evidências de exemplo com PASS.

Verificar integridade com psql -X -v ON_ERROR_STOP=1 -f infrastructure/release/integrity.sql usando credencial read-only. Staging: smoke autenticado e teste de carga controlado (APP_ENV=staging, AUTHORIZED_STAGING_HOST, STAGING_API_URL, STAGING_WEB_URL, caminhos GET reais em STAGING_READ_PATHS e credenciais sintéticas). Mede p95 e erros; metas comuns <500ms, dashboard <1s e 5xx <1%. Não executar carga em produção.

Aprovação exige isolamento, autenticação HTTPS, integridade financeira, backups, restore, TLS, secrets, base disponível, storage, CI e scans/testes críticos. A infraestrutura cloud, validação SES, UAT, domínio e aprovações sem evidência mantêm o gate fechado. Não criar tag comercial em condição pendente.
