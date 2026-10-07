import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ApiRequest } from "../auth/security.js";
import { TenantRoles } from "../auth/security.js";
import { RequestDoc } from "../docs.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import * as v from "../../../../packages/validation/src/commercial.js";
import { CommercialService } from "./commercial.service.js";
import { CommercialDocumentController } from "./document.controller.js";
import { CostService } from "./cost.service.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
import { DocumentModule } from "../document/document.module.js";
@ApiTags("Suppliers")
@TenantRoles("ADMIN", "MANAGER")
@Controller("api/v1/suppliers")
class SupplierController {
  constructor(@Inject(CommercialService) readonly s: CommercialService) {}
  @Get() list(@Req() r: ApiRequest, @Query() q: unknown) {
    return this.s.suppliers(r, v.pageInput.parse(q));
  }
  @Get(":id") get(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.s.supplier(r, uuid.parse(id));
  }
  @Post() @RequestDoc(v.supplierInput) create(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.s.saveSupplier(r, v.supplierInput.parse(b));
  }
  @Patch(":id") @RequestDoc(v.supplierPatch) patch(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveSupplier(r, v.supplierPatch.parse(b), uuid.parse(id));
  }
  @Post(":id/deactivate") @RequestDoc(v.actionInput) deactivate(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveSupplier(
      r,
      { version: v.actionInput.parse(b).version, status: "INACTIVE" },
      uuid.parse(id),
      true,
    );
  }
}
@ApiTags("Commercial")
@Controller("api/v1/projects/:projectId")
class CommercialController {
  constructor(
    @Inject(CommercialService) readonly s: CommercialService,
    @Inject(CostService) readonly costs: CostService,
  ) {}
  @Get("contracts") contracts(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.contracts(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("contracts") @RequestDoc(v.contractInput) createContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.saveContract(r, uuid.parse(p), v.contractInput.parse(b));
  }
  @Get("contracts/:contractId") contract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
  ) {
    return this.s.readContract(r, uuid.parse(p), uuid.parse(c));
  }
  @Patch("contracts/:contractId") @RequestDoc(v.contractPatch) patchContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.saveContract(
      r,
      uuid.parse(p),
      v.contractPatch.parse(b),
      uuid.parse(c),
    );
  }
  @Post("contracts/:contractId/activate")
  @RequestDoc(v.actionInput)
  activateContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionContract(
      r,
      uuid.parse(p),
      uuid.parse(c),
      "activate",
      v.actionInput.parse(b).version,
    );
  }
  @Post("contracts/:contractId/suspend")
  @RequestDoc(v.actionInput)
  suspendContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionContract(
      r,
      uuid.parse(p),
      uuid.parse(c),
      "suspend",
      v.actionInput.parse(b).version,
    );
  }
  @Post("contracts/:contractId/complete")
  @RequestDoc(v.actionInput)
  completeContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionContract(
      r,
      uuid.parse(p),
      uuid.parse(c),
      "complete",
      v.actionInput.parse(b).version,
    );
  }
  @Post("contracts/:contractId/terminate")
  @RequestDoc(v.actionInput)
  terminateContract(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionContract(
      r,
      uuid.parse(p),
      uuid.parse(c),
      "terminate",
      v.actionInput.parse(b).version,
    );
  }
  @Get("contracts/:contractId/items") items(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Query() q: unknown,
  ) {
    return this.s.items(r, uuid.parse(p), uuid.parse(c), v.pageInput.parse(q));
  }
  @Post("contracts/:contractId/items") @RequestDoc(v.itemInput) addItem(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.itemInput.parse(b),
    );
  }
  @Patch("contracts/:contractId/items/:itemId")
  @RequestDoc(v.itemInput)
  patchItem(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("itemId") i: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.itemInput.parse(b),
      uuid.parse(i),
      false,
    );
  }
  @Delete("contracts/:contractId/items/:itemId")
  @RequestDoc(v.actionInput)
  removeItem(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("itemId") i: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.actionInput.parse(b),
      uuid.parse(i),
      true,
    );
  }
  @Get("contracts/:contractId/amendments") amendments(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Query() q: unknown,
  ) {
    return this.s.amendments(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.pageInput.parse(q),
    );
  }
  @Post("contracts/:contractId/amendments")
  @RequestDoc(v.amendmentInput)
  createAmendment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Body() b: unknown,
  ) {
    return this.s.saveAmendment(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.amendmentInput.parse(b),
    );
  }
  @Patch("contracts/:contractId/amendments/:amendmentId")
  @RequestDoc(v.amendmentPatch)
  patchAmendment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("amendmentId") a: string,
    @Body() b: unknown,
  ) {
    return this.s.saveAmendment(
      r,
      uuid.parse(p),
      uuid.parse(c),
      v.amendmentPatch.parse(b),
      uuid.parse(a),
    );
  }
  @Post("contracts/:contractId/amendments/:amendmentId/submit")
  @RequestDoc(v.actionInput)
  submitAmendment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("amendmentId") a: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionAmendment(
      r,
      uuid.parse(p),
      uuid.parse(c),
      uuid.parse(a),
      "submit",
      v.actionInput.parse(b),
    );
  }
  @Post("contracts/:contractId/amendments/:amendmentId/approve")
  @RequestDoc(v.actionInput)
  approveAmendment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("amendmentId") a: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionAmendment(
      r,
      uuid.parse(p),
      uuid.parse(c),
      uuid.parse(a),
      "approve",
      v.actionInput.parse(b),
    );
  }
  @Post("contracts/:contractId/amendments/:amendmentId/reject")
  @RequestDoc(v.actionInput)
  rejectAmendment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Param("amendmentId") a: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionAmendment(
      r,
      uuid.parse(p),
      uuid.parse(c),
      uuid.parse(a),
      "reject",
      v.actionInput.parse(b),
    );
  }
  @Get("cost-centers") centers(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.centers(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("cost-centers") @RequestDoc(v.centerInput) createCenter(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.saveCenter(r, uuid.parse(p), v.centerInput.parse(b));
  }
  @Patch("cost-centers/:id") @RequestDoc(v.centerPatch) patchCenter(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveCenter(
      r,
      uuid.parse(p),
      v.centerPatch.parse(b),
      uuid.parse(id),
    );
  }
  @Post("cost-centers/:id/deactivate")
  @RequestDoc(v.actionInput)
  deactivateCenter(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveCenter(
      r,
      uuid.parse(p),
      { version: v.actionInput.parse(b).version, status: "INACTIVE" },
      uuid.parse(id),
    );
  }
  @Get("expenses") expenses(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.expenses(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("expenses") @RequestDoc(v.expenseInput) createExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.saveExpense(r, uuid.parse(p), v.expenseInput.parse(b));
  }
  @Get("expenses/:expenseId") expense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
  ) {
    return this.s.readExpense(r, uuid.parse(p), uuid.parse(e));
  }
  @Patch("expenses/:expenseId") @RequestDoc(v.expensePatch) patchExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Body() b: unknown,
  ) {
    return this.s.saveExpense(
      r,
      uuid.parse(p),
      v.expensePatch.parse(b),
      uuid.parse(e),
    );
  }
  @Post("expenses/:expenseId/submit") @RequestDoc(v.actionInput) submitExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionExpense(
      r,
      uuid.parse(p),
      uuid.parse(e),
      "submit",
      v.actionInput.parse(b),
    );
  }
  @Post("expenses/:expenseId/approve")
  @RequestDoc(v.actionInput)
  approveExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionExpense(
      r,
      uuid.parse(p),
      uuid.parse(e),
      "approve",
      v.actionInput.parse(b),
    );
  }
  @Post("expenses/:expenseId/reject") @RequestDoc(v.actionInput) rejectExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionExpense(
      r,
      uuid.parse(p),
      uuid.parse(e),
      "reject",
      v.actionInput.parse(b),
    );
  }
  @Post("expenses/:expenseId/reverse")
  @RequestDoc(v.actionInput)
  reverseExpense(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Body() b: unknown,
  ) {
    return this.s.transitionExpense(
      r,
      uuid.parse(p),
      uuid.parse(e),
      "reverse",
      v.actionInput.parse(b),
    );
  }
  @Get("contracts/:contractId/history") contractsHistory(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("contractId") c: string,
    @Query() q: unknown,
  ) {
    return this.s.history(
      r,
      uuid.parse(p),
      "Contract",
      uuid.parse(c),
      v.pageInput.parse(q),
    );
  }
  @Get("expenses/:expenseId/history") expensesHistory(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("expenseId") e: string,
    @Query() q: unknown,
  ) {
    return this.s.history(
      r,
      uuid.parse(p),
      "Expense",
      uuid.parse(e),
      v.pageInput.parse(q),
    );
  }
  @Get("costs/summary") summary(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.costs.summary(r, uuid.parse(p));
  }
  @Get("costs/items") costItems(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    const query = v.pageInput.parse(q);
    return this.costs.items(r, uuid.parse(p), query.page, query.limit);
  }
}
@Module({
  imports: [ScheduleModule, DocumentModule],
  providers: [CommercialService, CostService],
  exports: [CommercialService],
  controllers: [
    SupplierController,
    CommercialController,
    CommercialDocumentController,
  ],
})
export class SupplierModule {}
@Module({ imports: [SupplierModule] })
export class ContractModule {}
@Module({ imports: [SupplierModule] })
export class CostCenterModule {}
@Module({ imports: [SupplierModule] })
export class ExpenseModule {}
