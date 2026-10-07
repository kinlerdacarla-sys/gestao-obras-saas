# Fornecedores e subempreiteiros (M4)

Cadastro tenant-scoped em `/suppliers`. Tipos: SUPPLIER, SUBCONTRACTOR, CONSULTANT, SERVICE_PROVIDER e OTHER. Estados ACTIVE, INACTIVE e BLOCKED. ADMIN cria, edita e desativa; MANAGER consulta para selecionar fornecedores em contratos/despesas. Restantes roles não consultam o cadastro global.

`Supplier` é o perfil comercial. Quando indicada uma organização existente, são reutilizados `organization_id`, nome legal e NUIT. Sem ID explícito, procura-se organização por NUIT ou, na ausência deste, nome legal. Não se cria outra organização automaticamente. Unicidade por tenant/organização e tenant/NUIT evita perfis duplicados. A contagem de contratos só inclui obras autorizadas.

API `/api/v1/suppliers`: GET/POST; `/:id`: GET/PATCH; `/:id/deactivate`: POST. PATCH/desativação exigem `version`. Listagem paginada (`page=1&limit=50`, máximo 200), filtros `type`, `status`, `search`. Alterações auditadas; não existe hard delete.
