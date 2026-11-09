# Backup e restore

Objetivos RPO/RTO devem ser aprovados antes do lançamento. Usar backups cifrados, conta separada, retenção documentada e cópia fora do host. Não executar restore no banco ativo.

## PostgreSQL

Backup lógico: `pg_dump --format=custom --no-owner --file=backup.dump "$DATABASE_URL"` num runner privado com credenciais do secret store (evitar argumentos em ambientes com inspeção de processos; preferir PGSERVICE/PGPASSFILE). Confirmar exit code, checksum e `pg_restore --list backup.dump`. Para PITR, usar backup físico com pgBackRest/WAL-G, arquivamento WAL contínuo e retenção adequada; nunca prometer PITR a partir de pg_dump sozinho. Monitorizar atraso/falha de arquivamento e testar recuperação até timestamp.

## Documentos

Guardar volumes document-storage e budget-storage junto do marco de consistência da DB; congelar escrita/snapshot coordenado durante captura. No armazenamento de objetos gerido, ativar versioning, retenção e replicação, com contas isoladas. O adaptador atual usa filesystem persistente: snapshots versionados no host/serviço de volumes são necessários. Não presumir que um volume Docker tem versioning.

## Restore isolado

1. Criar DB, Redis e diretórios novos, identificados como restore-test. Bloquear tráfego de produção e entrega externa de emails.
2. Verificar checksum e inventário, restaurar com `pg_restore --exit-on-error --no-owner --dbname=<DB isolada> backup.dump`.
3. Restaurar documentos/budgets do mesmo ponto e proprietários UID 1000. Preservar chaves de cifragem necessárias aos convites pendentes, através do secret store.
4. Verificar migrations; nunca executar seed demo na cópia de produção. Não importar Redis de produção para reexecutar jobs. Reconstruir filas controladamente a partir dos estados persistidos.
5. Executar health, login de conta autorizada, isolamento tenant, leitura de obra/orçamento/cronograma, checksum/download de documento, exportação, consistência de uso e auditoria.
6. Registar timestamp, duração, versão, volumes/backup utilizados, divergências e aprovação; remover apenas recursos comprovadamente pertencentes ao teste.

Checklist: backup legível; WAL recuperável; volume correspondente; contagens/FKs válidas; segredos não expostos; jobs não duplicados; email externo bloqueado; RPO/RTO medidos; evidência arquivada. Repetir periodicamente. Um teste local não substitui o ensaio do fornecedor de produção.

## Ensaio reproduzível M9

Construir a imagem de validação com docker compose --profile validation build tests, depois executar python infrastructure/release/restore-drill.py. Cria um projeto Compose de nome aleatório sem publicar PostgreSQL/Redis, aplica migrations, carrega o seed **apenas de teste**, faz dump e restore noutra base, verifica uma obra representativa, executa o SQL de integridade em transação read-only e testa a prontidão da API restaurada. Elimina apenas o projeto isolado criado pelo próprio script. Este exercício local não verifica snapshots RDS, PITR AWS ou recuperação física regional.

RDS AWS: janela de backup 01:00–02:00 UTC, retenção produção 14 dias. Antes de migração de risco obter snapshot disponível e registrar ponto de recuperação. Restaurar sempre para nova instância privada; definir SG, subnets e KMS corretos, aplicar migrations compatíveis e o mesmo smoke. Guardar o tempo real, RPO/RTO e aprovação.
