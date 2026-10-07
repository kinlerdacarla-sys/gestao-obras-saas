# Contratos, adendas e termos comerciais (M4)

Rotas `/api/v1/projects/:projectId/contracts` e frontend `/projects/[id]/contracts`. Contratos pertencem ao tenant e à obra autenticados; fornecedores precisam estar ativos. Número único por tenant/obra.

## Cálculos

Todos os montantes são NUMERIC(18,2), transmitidos em strings decimais MZN. Quantidades NUMERIC(18,4); cálculos Decimal e arredondamento HALF_UP. `originalValue` é definido na criação e nunca alterado, nem em DRAFT. `currentValue = originalValue + adições aprovadas − supressões aprovadas`, recalculado na mesma transação da aprovação. Nunca pode ficar negativo.

Itens aceitam quantidade e preço unitário juntos ou valor fixo. Quando existem quantidade e preço, o total recebido é ignorado e recalculado. A ativação exige soma dos itens igual ao valor original. Em DRAFT, editar/remover/adicionar item exige a versão corrente do contrato e incrementa-a. Remoção é lógica. Depois de ativado, termos e itens ficam congelados; alterações financeiras usam adendas. Um item orçamental ativo da mesma obra pode aparecer em vários contratos e um contrato pode conter várias rubricas.

## Estados e autorização

DRAFT → ACTIVE → SUSPENDED → ACTIVE; ACTIVE → COMPLETED ou TERMINATED; SUSPENDED → TERMINATED. CANCELLED está reservado no modelo, sem operação exposta nesta milestone. Apenas ADMIN ativa/suspende/conclui/termina. MANAGER autorizado na obra cria contratos e edita DRAFT. ADMIN/MANAGER editam; INSPECTOR e FINANCIER leem contratos autorizados; CLIENT não tem acesso comercial no MVP.

Adendas ADDITION/OMISSION têm valor positivo. TIME_EXTENSION/OTHER têm valor zero e data de efeito informativa; não reescrevem o prazo original. DRAFT → SUBMITTED → APPROVED ou REJECTED. Só APPROVED afeta o valor. ADMIN aprova/rejeita; criador não aprova o próprio registo quando `PREVENT_SELF_APPROVAL=true` (inclui ADMIN). Outro administrador, como `diretor@example.com` no demo, pode aprovar. FINANCIER vê apenas adendas aprovadas. Não há edição/cancelamento de adenda aprovada: correção exige adenda compensatória.

## Retenção e adiantamento

Percentuais entre 0 e 100. `calculateRetention(amount, percentage)` calcula o valor, sem criar retenção de medição. Adiantamento percentual usa **valor original**, mesmo após adendas. Um valor fixo também é permitido; enviar percentual positivo e valor fixo positivo é rejeitado. Adiantamento não excede original. `advanceRecoveredAmount` inicia em zero e não tem mutação M4; `advanceOutstandingAmount = advanceAmount − advanceRecoveredAmount`. Recuperação fica para M5.

## Endpoints adicionais

`/:contractId`: GET/PATCH. POST `activate`, `suspend`, `complete`, `terminate`, todos com `version`.

`/:contractId/items`: GET/POST; `/:itemId`: PATCH/DELETE (versão do contrato).

`/:contractId/amendments`: GET/POST; `/:amendmentId`: PATCH; POST `submit`, `approve`, `reject` (versão da adenda; rejeição exige motivo).

`/:contractId/documents`: GET/POST; upload PUT e confirmação POST usam DocumentModule. Anexos só podem ser adicionados em DRAFT; leitura privada com autorização. `/:contractId/history` é paginado e disponível à gestão. Documentos, itens e adendas estão nas respetivas abas.
