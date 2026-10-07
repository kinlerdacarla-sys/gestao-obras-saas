# Arquitetura — M1 Core SaaS

## Organização

Monorepo npm workspaces. `apps/web` contém Next.js App Router e React; `apps/api` é um monólito modular NestJS; `apps/worker` executa BullMQ. TypeScript strict em aplicações, bibliotecas e testes. O backend não importa o frontend. ESM nativo, imports `.js` no código compilado do servidor e Prisma 7 com `PrismaPg`.

Os módulos Auth, Tenant, Organization, User, Project, Audit, Health e Notification têm responsabilidades explícitas. PlatformModule fornece PostgreSQL e Redis. Os services executam regras e transações; controllers validam entradas e encaminham operações. `packages/domain` contém decisões de autorização puras; `validation` contém schemas Zod; `types` contém contratos de contexto e erros; `config` valida ambiente; `ui` contém componentes React partilhados.

## Identidade e tenancy

User é identidade global; TenantUser representa a associação a uma empresa SaaS cliente. Organization é uma entidade participante pertencente a um tenant. Não é uma empresa com assinatura por si só.

Login recebe `tenantSlug` como seletor de empresa, nunca como autorização: o servidor autentica a password e confirma membership ativo e tenant ativo. O JWT é assinado com o tenant validado. Todas as operações autenticadas obtêm tenant do JWT e revalidam sessão, utilizador, tenant e membership no banco. Não há endpoint para trocar livremente o tenant. Schemas estritos rejeitam `tenantId` enviado nos DTOs operacionais.

TenantScope produz filtros obrigatórios para consultas de recursos. Os services usam `tenantId` também nos filtros de associações. As chaves estrangeiras compostas `(tenant_id, project_id)`, `(tenant_id, organization_id)` e `(tenant_id, user_id)` impedem relações entre tenants na base de dados. Recursos de outro tenant respondem 404. O modelo não usa RLS nesta milestone: isolamento na aplicação e integridade relacional, cobertos por testes reais com duas empresas. A credencial SQL deve permanecer privada ao backend.

Exceções de autenticação são explícitas: login consulta Tenant por slug e User global por e-mail; refresh e reset localizam credenciais pelo hash aleatório antes de existir contexto autenticado e todas as mutações seguintes incluem o tenant encontrado. Uma alteração de password revoga todas as sessões da identidade global, incluindo outros tenants, intencionalmente. Nenhuma destas exceções é uma consulta de recursos de negócio por IDs fornecidos pelo cliente.

## Sessões e passwords

Argon2id (19 MiB, duas iterações, paralelismo 1). Password mínima de 10 caracteres, máximo 128, combinação de letras e outros caracteres, rejeição de sequências comuns. Tokens de recuperação e refresh têm 256 bits de entropia; SHA-256 é usado apenas para indexar esses tokens aleatórios, nunca passwords.

JWT HS256 com emissor/audiência fixos e duração de 15 minutos. Refresh válido por sete dias absolutos. Rotação usa compare-and-swap: atualizar apenas a sessão cujo hash antigo ainda corresponde. Duas requisições simultâneas têm um único vencedor; o token antigo deixa de existir como credencial. Logout e desativação revogam sessões imediatamente, incluindo access tokens ainda dentro da validade. O frontend coordena pedidos de refresh para evitar concorrência desnecessária.

Cookies HttpOnly, SameSite=Lax, Secure em produção. O frontend nunca guarda tokens em localStorage. Next encaminha `/api/*` ao backend, mantendo a mesma origem no navegador. Mutações exigem `Origin === WEB_ORIGIN`, incluindo login, refresh e reset; esta é a defesa CSRF. Clientes HTTP de testes/API devem enviar Origin explicitamente. CORS permite apenas essa origem. O backend não confia automaticamente em X-Forwarded-For; em instalações com proxy é necessário configurar o ingress e os hops de confiança para rate limiting por IP real. Redis mantém limites por IP e identidade durante 15 minutos, com incremento/TTL atómico. Falha do Redis impede novas autenticações em vez de ignorar limites.

## Autorização

TenantRoles e ProjectRoles são decorators reutilizáveis aplicados pelo SessionGuard global. Administrador do tenant consulta e gere todas as obras desse tenant. Outros perfis só consultam obras com associação ativa. Edição operacional exige tenant MANAGER e project MANAGER; os dois eixos são validados. Código e valor contratual ficam restritos a ADMIN. Apenas ADMIN gere pessoas, organizações e associações. O perfil ADMIN numa associação não transforma um CLIENT em administrador do tenant.

Desativação afeta o membership daquele tenant, suas sessões e associações; não elimina a identidade global. DELETE de participante elimina somente a associação. Administradores não podem desativar a própria associação nem retirar o próprio perfil ADMIN. Convites para e-mails globais já existentes respondem EMAIL_ALREADY_EXISTS: o fluxo de adesão de uma identidade existente a outro tenant é deliberadamente reservado para uma milestone futura, evitando associação indevida.

## Integridade e auditoria

UUIDs em todas as chaves, `timestamptz` para instantes, `DATE` para datas da obra. Valores monetários são strings na API e DECIMAL(18,2) no PostgreSQL. Restrição SQL fixa MZN e impede valores negativos ou datas invertidas.

Mutações de domínio e audit logs usam a mesma transação. Sem auditoria persistida, a alteração não é confirmada. Logs omitem passwords, hashes e tokens. Trigger SQL bloqueia UPDATE/DELETE em audit_logs, além de não existirem endpoints dessas operações. GET `/audit-logs` é exclusivo de ADMIN e filtra tenant, devolvendo os últimos 100 eventos. Logins inválidos com tenant conhecido são auditados sem atribuir identidades de outros tenants; tenants desconhecidos apenas entram no controlo de tentativas Redis, pois não existe tenant válido para uma FK de auditoria.

## Notificações e worker

NotificationModule tem um adaptador de entrega local: links de convite/recuperação aparecem nos logs somente em development/test. Em produção essas operações respondem 503 até implementar um fornecedor real. Nenhum e-mail externo é enviado na M1. Tokens expiram, têm utilização única e só o hash fica no banco. Convite: 24 horas; recuperação: 30 minutos. O worker conecta ao Redis e está preparado para a fila `notifications`; processa somente jobs `health`, rejeitando tipos não implementados.

## Interface e scope

UI responsiva em português, dashboard filtrado pelos acessos, obras, participantes e configurações. Componentes têm estados de espera, erro, vazio e sucesso. Contagem de utilizadores do tenant é exclusiva de ADMIN; outros perfis veem “—”. Relatórios e futuras abas estão desativados. Não há orçamento, cronograma, contratos, medições, fiscalização, despesas ou financiamento.

## Verificação e operação

Vitest exercita funções de segurança e HTTP real contra PostgreSQL/Redis. Testes de integração exigem base cujo URL contenha `test`; criam fixtures UUID sem apagar dados existentes e usam Redis database 15. Playwright percorre o fluxo principal e permissões de cliente, incluindo viewport móvel. CI instala dependências fixadas no lockfile, valida, testa, compila e executa E2E; não publica em produção.

Compose é apenas desenvolvimento: serviços vinculados ao loopback do host, credenciais demo e volumes persistentes. Node 24 e PostgreSQL 18 seguem os requisitos. O Dockerfile instala ferramentas de desenvolvimento; não é uma imagem endurecida de produção. O seed é idempotente e não redefine passwords/roles de registos existentes, nem executa em produção.

## Referências oficiais consultadas

- [Prisma 7: ESM, config e driver adapter](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [NestJS 12: releases e mudanças](https://github.com/nestjs/nest/releases)
- [Next.js 16: instalação e requisitos](https://nextjs.org/docs/app/getting-started/installation)
- [PostgreSQL: binários Windows](https://www.postgresql.org/download/windows/)

Foram fixados overrides transitivos `deepmerge-ts@8.0.2` e `mysql2@3.24.5` para corrigir avisos de segurança do tooling Prisma 7 sem alterar a major exigida. Geração do cliente, migrations, seed e testes foram executados com esses overrides.
