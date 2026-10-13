import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ApiRequest } from "../auth/security.js";
import { RequestDoc } from "../docs.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import * as v from "../../../../packages/validation/src/financial.js";
import { FinancialService } from "./financial.service.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
@ApiTags("Financial")
@Controller("api/v1/projects/:projectId")
class FinancialController {
  constructor(@Inject(FinancialService) readonly s: FinancialService) {}
  @Get("financial/summary") summary(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.summary(r, uuid.parse(p));
  }
  @Get("financial/curve") curve(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.curve(r, uuid.parse(p));
  }
}
@ApiTags("Measurement")
@Controller("api/v1/projects/:projectId")
class MeasurementController {
  constructor(@Inject(FinancialService) readonly s: FinancialService) {}
  @Get("measurements") getMeasurements(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.listMeasurements(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("measurements") @RequestDoc(v.measurement) postMeasurements(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.saveMeasurement(r, uuid.parse(p), v.measurement.parse(b));
  }
  @Get("measurements/:id") getMeasurementsId(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.readMeasurement(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("measurements/:id")
  @RequestDoc(v.measurementPatch)
  patchMeasurementsId(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveMeasurement(
      r,
      uuid.parse(p),
      v.measurementPatch.parse(b),
      uuid.parse(id),
    );
  }
  @Get("measurements/:id/items") getMeasurementsIdItems(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.s.items(r, uuid.parse(p), uuid.parse(id), v.pageInput.parse(q));
  }
  @Post("measurements/:id/items") @RequestDoc(v.item) postMeasurementsIdItems(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(r, uuid.parse(p), uuid.parse(id), v.item.parse(b));
  }
  @Patch("measurements/:id/items/:itemId")
  @RequestDoc(v.item)
  patchMeasurementsIdItemsItemid(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.item.parse(b),
      uuid.parse(itemId),
    );
  }
  @Delete("measurements/:id/items/:itemId")
  @RequestDoc(v.action)
  deleteMeasurementsIdItemsItemid(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() b: unknown,
  ) {
    return this.s.saveItem(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.action.parse(b),
      uuid.parse(itemId),
      true,
    );
  }
  @Post("measurements/:id/deductions")
  @RequestDoc(v.deduction)
  postMeasurementsIdDeductions(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.deduction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.deduction.parse(b),
    );
  }
  @Delete("measurements/:id/deductions/:itemId")
  @RequestDoc(v.action)
  deleteMeasurementsIdDeductionsItemid(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() b: unknown,
  ) {
    return this.s.deduction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.action.parse(b),
      uuid.parse(itemId),
    );
  }
  @Post("measurements/:id/submit")
  @RequestDoc(v.action)
  postMeasurementsIdSubmit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "submit",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/fiscal-start")
  @RequestDoc(v.action)
  postMeasurementsIdFiscalStart(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "fiscal-start",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/fiscal-approve")
  @RequestDoc(v.action)
  postMeasurementsIdFiscalApprove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "fiscal-approve",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/fiscal-reject")
  @RequestDoc(v.action)
  postMeasurementsIdFiscalReject(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "fiscal-reject",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/fiscal-request-changes")
  @RequestDoc(v.action)
  postMeasurementsIdFiscalRequestChanges(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "fiscal-request-changes",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/reopen")
  @RequestDoc(v.action)
  postMeasurementsIdReopen(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reopen",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/approve")
  @RequestDoc(v.action)
  postMeasurementsIdApprove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "approve",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/reject")
  @RequestDoc(v.action)
  postMeasurementsIdReject(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reject",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/certify")
  @RequestDoc(v.action)
  postMeasurementsIdCertify(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "certify",
      v.action.parse(b),
    );
  }
  @Post("measurements/:id/reverse")
  @RequestDoc(v.action)
  postMeasurementsIdReverse(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reverse",
      v.action.parse(b),
    );
  }
  @Patch("contracts/:id/financial-settings")
  @RequestDoc(v.settings)
  patchContractsIdFinancialSettings(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.settings(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.settings.parse(b),
    );
  }
  @Get("contracts/:id/retention") getContractsIdRetention(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.s.retention(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.pageInput.parse(q),
    );
  }
  @Post("contracts/:id/retention-releases")
  @RequestDoc(v.release)
  postContractsIdRetentionReleases(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.createRelease(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.release.parse(b),
    );
  }
  @Post("retention-releases/:id/submit")
  @RequestDoc(v.action)
  postRetentionReleasesIdSubmit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.releaseAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "submit",
      v.action.parse(b),
    );
  }
  @Post("retention-releases/:id/approve")
  @RequestDoc(v.action)
  postRetentionReleasesIdApprove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.releaseAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "approve",
      v.action.parse(b),
    );
  }
  @Post("retention-releases/:id/reject")
  @RequestDoc(v.action)
  postRetentionReleasesIdReject(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.releaseAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reject",
      v.action.parse(b),
    );
  }
}
@ApiTags("Funding")
@Controller("api/v1/projects/:projectId")
class FundingController {
  constructor(@Inject(FinancialService) readonly s: FinancialService) {}
  @Get("funding-agreements") getFundingAgreements(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.listFunding(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("funding-agreements") @RequestDoc(v.funding) postFundingAgreements(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.saveFunding(r, uuid.parse(p), v.funding.parse(b));
  }
  @Get("funding-agreements/:id") getFundingAgreementsId(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.readFunding(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("funding-agreements/:id")
  @RequestDoc(v.fundingPatch)
  patchFundingAgreementsId(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.saveFunding(
      r,
      uuid.parse(p),
      v.fundingPatch.parse(b),
      uuid.parse(id),
    );
  }
  @Get("disbursement-requests") getDisbursementRequests(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.listRequests(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Post("disbursement-requests")
  @RequestDoc(v.request)
  postDisbursementRequests(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.createRequest(r, uuid.parse(p), v.request.parse(b));
  }
  @Post("disbursement-requests/:id/submit")
  @RequestDoc(v.approveRequest)
  postDisbursementRequestsIdSubmit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.requestAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "submit",
      v.approveRequest.parse(b),
    );
  }
  @Post("disbursement-requests/:id/approve")
  @RequestDoc(v.approveRequest)
  postDisbursementRequestsIdApprove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.requestAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "approve",
      v.approveRequest.parse(b),
    );
  }
  @Post("disbursement-requests/:id/reject")
  @RequestDoc(v.approveRequest)
  postDisbursementRequestsIdReject(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.requestAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reject",
      v.approveRequest.parse(b),
    );
  }
  @Post("disbursement-requests/:id/disbursements")
  @RequestDoc(v.disbursement)
  postDisbursementRequestsIdDisbursements(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.postDisbursement(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.disbursement.parse(b),
    );
  }
  @Post("disbursements/:id/reverse")
  @RequestDoc(v.action)
  postDisbursementsIdReverse(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.reverseDisbursement(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.action.parse(b),
    );
  }
}
@ApiTags("Payment")
@Controller("api/v1/projects/:projectId")
class PaymentController {
  constructor(@Inject(FinancialService) readonly s: FinancialService) {}
  @Get("payments") getPayments(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.listPayments(r, uuid.parse(p), v.pageInput.parse(q));
  }
  @Get("payments/:id") getPaymentsId(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.readPayment(r, uuid.parse(p), uuid.parse(id));
  }
  @Post("payments") @RequestDoc(v.payment) postPayments(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.s.postPayment(r, uuid.parse(p), v.payment.parse(b));
  }
  @Post("payments/:id/reverse") @RequestDoc(v.action) postPaymentsIdReverse(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.reversePayment(
      r,
      uuid.parse(p),
      uuid.parse(id),
      v.action.parse(b),
    );
  }
}
@Module({
  imports: [ScheduleModule],
  providers: [FinancialService],
  exports: [FinancialService],
  controllers: [FinancialController],
})
export class FinancialModule {}
@Module({ imports: [FinancialModule], controllers: [MeasurementController] })
export class MeasurementModule {}
@Module({ imports: [FinancialModule], controllers: [FundingController] })
export class FundingModule {}
@Module({ imports: [FinancialModule], controllers: [PaymentController] })
export class PaymentModule {}
