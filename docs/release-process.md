# Processo de release

CI atual: install, Prisma generate/validate/migrate/status, lint, typecheck, unit, integração PostgreSQL/Redis, seed isolado, build, E2E, Compose clean-room e build das três imagens de produção. Tags das imagens usam github.sha. Nenhum job de deploy de produção é disparado automaticamente.

A infraestrutura remota de staging não está definida no repositório. Depois de configurar registry, host/cluster, secrets e ambiente protegido, promover o mesmo SHA para staging, executar smoke e rever evidências. Produção exige aprovação humana no ambiente protegido, backup verificado e plano de rollback. Não adicionar credenciais ao workflow.

Rollback de aplicação: imagem do SHA anterior somente se compatível com schema expandido. Migrations aditivas não são revertidas apagando tabelas/dados. Para recuperação de dados seguir backup-restore.md num ambiente isolado antes de qualquer corte. Registrar responsável, SHA, migrations, resultado dos testes e smoke. Não usar force push.
