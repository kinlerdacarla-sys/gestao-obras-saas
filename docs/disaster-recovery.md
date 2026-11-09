# Recuperação de desastre
Objetivos iniciais do piloto, sem garantia contratual: RPO ≤15 minutos, RTO ≤4 horas. Medir com restore real na conta e rede do piloto. Um pg_dump local não mede o RPO de RDS.

| Evento | Contenção e recuperação | Prova para encerrar |
|---|---|---|
| Corrupção/eliminação DB | Parar escritas, preservar snapshot atual e logs. Restaurar por PITR para nova instância privada no instante anterior, usar nova credencial restrita. | Integridade SQL, tenant/obra representativos, API e smoke antes da troca. |
| Documento eliminado | Identificar bucket/tenant/key, listar versões, copiar versão correta para nova versão atual. Nunca apagar a evidência anterior. | Checksum, permissões, download autorizado e teste de negação cross-tenant. |
| Perda Redis | Suspender produtores, recuperar réplica/snapshot; reconstituir cache e reconciliar jobs com PostgreSQL. Reenfileirar apenas com IDs idempotentes, inspecionar jobs financeiros individualmente. | Profundidade decresce, reconciliação não duplica operações. |
| Task/release falhada | Ver eventos ECS e restaurar a revisão anterior; não alterar schema às cegas. | Serviços estáveis, readiness e smoke. |
| Indisponibilidade de email | Ver SES, supressões, excesso de bounce e retries; preservar outbox. Reemitir convites expirados por processo autorizado. | Entrega em caixa de teste e verificação de uso único. |
| Credencial comprometida | Conter acesso, preservar trilhos, limitar IAM e rotacionar segredos/tokens afetados. | Acesso antigo negado, serviços e auditoria verificados. |

Guardar em local seguro os horários da falha, último dado recuperado, início/retorno e discrepâncias. Validar também recuperação de documentos e filas; S3 versioning não substitui cópia independente. Exercício mensal de piloto e antes de alteração arriscada.
