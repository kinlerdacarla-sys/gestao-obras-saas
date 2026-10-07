# Evidência de validação — 7 de outubro de 2026

## Resultado

Implementação funcional validada localmente. **59 testes aprovados**, lint, typecheck e build aprovados. A execução do Compose permanece por verificar porque Docker/WSL não estão instalados neste computador; não se declara validação completa do ambiente Docker.

| Verificação                      | Resultado                                                       |
| -------------------------------- | --------------------------------------------------------------- |
| `npm ci` / instalação e lockfile | Dependências instaladas; lockfile incluído                      |
| `npm run generate`               | Prisma Client 7.10.0 gerado                                     |
| `npm run migrate`                | Duas migrations aplicadas no PostgreSQL 18.6                    |
| `npx prisma migrate status`      | Schema atualizado                                               |
| `npm run seed`                   | Cinco contas, tenant, organização e obra demo criados           |
| `npm run lint`                   | Aprovado, sem erros                                             |
| `npm run typecheck`              | API, worker, packages, testes e web aprovados                   |
| `npm test`                       | 25/25 unitários aprovados                                       |
| `npm run test:integration`       | 31/31 testes HTTP/banco aprovados                               |
| `npm run test:e2e`               | 3/3 Playwright Chromium aprovados                               |
| `npm run build`                  | Backend/worker TypeScript e frontend Next.js produção aprovados |
| `npm audit`                      | Zero vulnerabilidades reportadas                                |
| API compilada                    | Arrancou e `/health` confirmou PostgreSQL/Redis disponíveis     |
| Worker BullMQ                    | Job `health` processado, resultado `{ok:true}`                  |
| Swagger                          | `/api/docs-json` respondeu, paths e schemas verificados         |
| Desktop/mobile                   | Capturas inspecionadas em 1440 px e 390 px                      |
| `docker compose up --build`      | Não executado: Docker indisponível                              |
| Pipeline GitHub Actions          | Preparada; não executada num runner remoto                      |

## Ambiente utilizado

Windows, Node.js 24.19.0, NestJS 12.1.2, Next.js 16.4.0, Prisma 7.10.0. PostgreSQL 18.6 via binários EDB em diretório temporário e Redis 8.2.10 via port comunitário redis-windows, com SHA-256 conferido contra o release. Estes serviços foram usados apenas para validação local; o Compose usa as imagens oficiais `postgres:18` e `redis:8.2`.

## Cobertura relevante

- Argon2id, passwords fracas, integridade de JWT e validade de 15 minutos.
- Guards e política de dois eixos: perfil de tenant e perfil de obra.
- Login, HttpOnly, CSRF por Origin, rate limiting Redis e falhas auditadas.
- Rotação de refresh, replay rejeitado e concorrência com um único vencedor.
- Criação de organização/obra, valor DECIMAL exato, datas e schemas estritos.
- Associação de utilizadores e recusa de FKs entre tenants no próprio banco.
- Tentativas GET/PATCH de obras de outro tenant, descoberta de organização, associação de user/organization externos e acesso a audit logs externos.
- Cliente sem acesso administrativo e sem visibilidade de obras não atribuídas.
- Remoção de associação preservando utilizador global.
- Convite sem exposição de credenciais, reset de utilização única e revogação de sessões.
- Logout, desativação e auditoria imutável.
- E2E principal completo, cliente e navegação responsiva.

## Limitações reais

1. Compose e pipeline remota precisam de uma execução em ambiente com Docker/GitHub Actions.
2. Entrega de e-mail está implementada como adaptador local; produção é bloqueada explicitamente até configurar fornecedor.

Estas limitações não são disfarçadas por mocks: a suíte de integração usa PostgreSQL e Redis reais; somente a entrega externa de um convite é intercetada num teste.

## Capturas

- [Login](screenshots/login.png)
- [Dashboard desktop](screenshots/dashboard.png)
- [Dashboard móvel](screenshots/mobile.png)
