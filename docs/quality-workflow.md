# Qualidade M6: integrações, política e validação

## Integrações

Cronograma, item orçamental e contrato apresentam contagens de inspeções, NCR abertas, críticas, vencidas e hold points por liberar. `quality_status` é derivado. A NCR não altera progresso físico, orçamento ou valor contratual. Diário permite criar NCR de uma ocorrência, mantendo referências. Medições podem ter NCR direta ou relacionadas via contrato/rubrica.

## Bloqueio temporal de certificação

A política por obra `block_measurement_on_open_critical_ncr` é true por omissão e editável por ADMIN com optimistic locking e auditoria. Dentro da mesma transação/bloqueio de obra da certificação M5, consulta NCR CRITICAL cujo estado seja diferente de CLOSED e que tenha measurement_id da medição, contract_id do contrato ou budget_item_id incluído nos itens medidos.

A regra segue literalmente `status != CLOSED`: uma NCR crítica CANCELLED também bloqueia; cancelar não contorna o controlo. A API retorna 409 MEASUREMENT_BLOCKED_BY_CRITICAL_NCR com até 200 NCR resumidas em details. Encerradas as NCR, uma nova tentativa pode certificar se todas as regras M5 também passarem. Idempotency-Key do M5 continua obrigatório.

Uma NCR criada/reaberta depois da certificação NÃO invalida o certificado nem bloqueia pagamentos retroativamente. Desativar a política é explícito e auditado. Não existe alteração automática de valores financeiros.

## Indicadores

InspectionsTotal inclui todos os estados. Resultados aprovados/reprovados/com observações e denominador de firstPassRate usam inspeções CLOSED. Cada inspeção conserva o resultado do checklist original; correções não o convertem em aprovação. FirstPassRate = PASS / CLOSED × 100, com zero para denominador zero. ClosureRate = NCR CLOSED / total NCR × 100. AverageClosureDays = média de closed_at − detected_at das NCR atualmente CLOSED. Reabertura remove a NCR dessa média até novo encerramento; timeline preserva os encerramentos anteriores.

NCR abertas excluem CLOSED/CANCELLED. Tendências semanais/mensais agrupam inspeções, falhas, criação e encerramento de NCR e NCR críticas por data; breakdown por categoria, severidade e organização. A série de encerramentos usa o encerramento corrente, não conta cada ciclo de reabertura como nova NCR.

## Notificações

O NotificationModule existente recebe uma caixa de entrada persistente por utilizador, apresentada no dashboard. Eventos de qualidade gravam notificações na mesma transação, sem depender de e-mail externo. O worker BullMQ existente agenda `quality-deadline-monitor` diariamente às 07:00 Africa/Maputo. Avisa até três dias antes e quando vencida. Chave única por NCR/prazo/tipo/destinatário impede repetição diária e permite novo aviso se o prazo mudar. Participação revogada impede acesso às notificações dessa obra.

## Teste manual

1. `docker compose up --build -d --wait`; API aplica migrations e seed. Use credenciais demo documentadas em `.env.example`.
2. Gestor: Edifício Demo → Fiscalização e qualidade → Pedidos; criar e submeter.
3. Fiscal: agendar pedido, criar inspeção com checklist publicado e iniciar.
4. Preencher itens; marcar FAIL, anexar fotografia do item, criar NCR crítica. Submeter inspeção. Hold point FAIL exige liberação justificada antes de encerrar.
5. Gestor: atribuir NCR, iniciar correção, criar ação, iniciar ação, anexar evidência e concluir. Marcar NCR pronta para verificação.
6. Fiscal: consultar evidências, aprovar verificação e encerrar NCR. Rejeitar/reabrir exige motivo.
7. Administrador: tentar certificar medição afetada enquanto NCR crítica está aberta; confirmar bloqueio. Após encerramento, certificar novamente.
8. Consultar dashboard, notificações, históricos e relatórios; usar Imprimir/Guardar PDF. O resultado histórico da inspeção reprovada permanece FAIL.

## Validação reproduzível

`docker compose --profile validation build tests` e `docker compose --profile validation run --rm tests` executam migrations, lint, typecheck, unitários, integração, seed, build e E2E contra PostgreSQL/Redis dedicados. O CI executa os mesmos estágios e uma stack Compose limpa. O teste de escala mantém 10.000 inspeções, 100.000 itens, 50.000 NCR e 100.000 ações, com preparação em lotes e medição separada das consultas. Não há deploy em produção.
