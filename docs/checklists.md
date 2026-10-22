# Templates e versões de checklist

ADMIN gere templates de âmbito tenant, com código único e estados DRAFT/ACTIVE/ARCHIVED. Uma versão DRAFT pode substituir os seus itens. Publicar requer pelo menos um item, fixa autor/data e torna a versão imutável; a anterior passa a SUPERSEDED. Uma versão antiga não pode substituir uma versão mais recente já publicada.

Alterações futuras criam nova versão, sem afetar inspeções existentes. Itens têm secção, código, descrição, ordem, tipo de resposta, obrigatoriedade, permissão de comentário, fotografia obrigatória em FAIL e opção hold point. Tipos: PASS_FAIL_NA, YES_NO_NA, TEXT, NUMBER, DATE. YES/NO usa PASS/FAIL na persistência.

Rotas de tenant: `/api/v1/checklist-templates`, `/:id/versions`, `/checklist-template-versions/:id`, `/:id/items` e `/:id/publish`. O backend ignora qualquer tentativa de fornecer tenant pelo corpo: DTOs são estritos e a sessão define o contexto.

Seed: CHK-FUND, CHK-STRUCT e CHK-MASON. São exemplos demo configuráveis, não requisitos legais universais. A UI está em `/checklist-templates`.
