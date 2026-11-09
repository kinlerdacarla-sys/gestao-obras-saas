# Rollback de release
Responsável: operador de release com acesso apenas ao ambiente afetado. Identificar SHA, digests, revisão anterior e desired count no artefacto de staging/production. Se uma migração falhar, a promoção termina antes da atualização dos serviços.

1. Conter escritas se necessário; manter health e acesso administrativo. Preservar logs, IDs das tasks e timestamp.
2. Confirmar que o schema atual é compatível com a versão anterior. Não executar automaticamente down migrations. A migration 19 é aditiva: o binário anterior ignora colunas/tabelas novas; convites novos podem necessitar da versão mais recente para entrega.
3. Para cada serviço, aws ecs update-service com o cluster e a task-definition anterior presentes na evidência. Esperar services-stable e verificar taskDefinition **e** runningCount: o waiter por si só não deteta rollback silencioso.
4. Repetir health/live, ready e smoke de leitura. Confirmar filas, emails e ausência de novos erros. O circuit breaker faz rollback de um rollout unhealthy; o script restaura também os outros serviços se o smoke falhar.
5. Se os dados estiverem comprometidos, seguir disaster-recovery.md para restaurar numa nova base. Não substituir a base original. Aprovação humana antes da troca. Não apagar imagens SHA ainda elegíveis para rollback.
