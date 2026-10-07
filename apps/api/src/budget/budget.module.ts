import { Module } from "@nestjs/common";
import { ProjectModule } from "../project/project.module.js";
import { BudgetAccess } from "./budget.access.js";
import { BudgetService } from "./budget.service.js";
import { BudgetItemService } from "./budget-item.service.js";
import { BudgetImportService } from "./import.service.js";
import { BudgetController } from "./budget.controller.js";
@Module({
  imports: [ProjectModule],
  providers: [
    BudgetAccess,
    BudgetService,
    BudgetItemService,
    BudgetImportService,
  ],
  controllers: [BudgetController],
})
export class BudgetModule {}
