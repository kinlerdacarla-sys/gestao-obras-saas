# Inspeções e pedidos

O InspectionModule reutiliza projetos, participantes, cronograma, orçamento, diários, contratos, medições e DocumentModule. Todas as rotas operacionais ficam em `/api/v1/projects/:projectId`; o tenant vem da sessão.

## Pedidos

MANAGER/ADMIN cria DRAFT e submete. INSPECTOR/ADMIN agenda e atribui fiscal da obra. Criar a inspeção a partir do pedido SCHEDULED passa o pedido para INSPECTION_IN_PROGRESS; encerrar passa para COMPLETED. Cancelar a inspeção devolve o pedido a SCHEDULED. Pedido pode ser cancelado antes do início. Números IR são gerados sob bloqueio transacional da obra.

## Execução

DRAFT → IN_PROGRESS → SUBMITTED → CLOSED. DRAFT/IN_PROGRESS podem ser canceladas. ADMIN/INSPECTOR executam. CLOSED não permite alterações, incluindo itens e evidências, com proteção adicional no PostgreSQL. Descobertas posteriores geram NCR sem reescrever o checklist original.

Cada inspeção fixa uma versão publicada de checklist. Respostas suportam PASS/FAIL/NA, texto, número decimal e data. Qualquer FAIL conserva resultado global FAIL, mesmo após correção via NCR ou liberação de hold point. Sem FAIL e com comentário relevante: PASS_WITH_OBSERVATIONS; caso contrário PASS. O servidor calcula o resultado.

Antes de submeter, todos os itens obrigatórios precisam de resposta. FAIL com requirePhotoOnFail exige fotografia confirmada do próprio item. Upload pendente não conta. Hold point reprovado sinaliza alerta crítico e impede encerramento até liberação explícita por fiscal/ADMIN, com motivo e auditoria. A liberação não transforma FAIL em PASS.

## Evidências e relatórios

`POST /inspections/:id/evidence` emite ticket assinado; PUT na URL devolvida envia multipart; POST `/inspections/:id/documents/:documentId/confirm` valida tamanho, MIME, assinatura e checksum. As imagens ficam no storage privado existente. Remover evidência antes do encerramento faz soft delete do documento e preserva o vínculo histórico. Downloads verificam sessão, obra e visibilidade.

`GET /inspections/:id/report` fornece relatório autorizado com identificação da obra, checklist, resultado, observações, NCR, evidências e identidade do responsável pelo encerramento. A página de relatório permite imprimir ou guardar PDF pelo navegador. Não é assinatura digital qualificada.

Listagens têm paginação e filtros de estado, resultado, fiscal, datas, tarefa, contrato e pesquisa. Versão desatualizada retorna 409 RESOURCE_VERSION_CONFLICT.
