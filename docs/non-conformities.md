# Não conformidades

NonConformityModule partilha o serviço de qualidade com InspectionModule. Códigos NCR são sequenciais por obra, gerados dentro da transação que bloqueia a linha do projeto.

Severidades LOW/MEDIUM/HIGH/CRITICAL e categorias WORKMANSHIP/MATERIAL/DESIGN/DIMENSION/SAFETY/DOCUMENTATION/EQUIPMENT/PROCESS/OTHER. As categorias não implementam gestão HSE completa.

## Estados

OPEN → ASSIGNED → CORRECTION_IN_PROGRESS → READY_FOR_VERIFICATION → CLOSED. Rejeição de correção vai para REOPENED, seguida de nova correção. Fiscal/ADMIN pode reabrir CLOSED com motivo. OPEN/ASSIGNED/CORRECTION_IN_PROGRESS/REOPENED podem ser cancelados com motivo; o histórico nunca é eliminado.

INSPECTOR/ADMIN cria e classifica. MANAGER/ADMIN pode executar correções; atribuição e início também são acessíveis ao fiscal. Só INSPECTOR/ADMIN verifica, encerra ou reabre. O executor não verifica a própria correção, mesmo se for ADMIN. O fiscal que detetou a NCR pode verificar trabalho executado por outra pessoa.

Responsável deve ser utilizador ativo da obra (ou ADMIN ativo do tenant) e organização deve estar associada à obra. Prazo vencido é calculado com data civil Africa/Maputo, quando due_date < hoje e estado não é CLOSED/CANCELLED. Atribuição que não envia novo prazo preserva o existente.

Eventos funcionais registam criação, atribuição, estados, comentários, ações, aprovação/rejeição e encerramento. São append-only e coexistem com AuditLog global. Comentários não são editados silenciosamente. Reabrir não apaga a verificação anterior dos atos: os eventos preservam-na; o resumo corrente limpa os campos de encerramento.

Referências opcionais são validadas por tenant e obra: inspeção/item, tarefa, rubrica, contrato, medição e diário. O endpoint de ocorrência `/daily-log-occurrences/:id/create-non-conformity` conserva a referência ao diário; não copia ficheiros.
