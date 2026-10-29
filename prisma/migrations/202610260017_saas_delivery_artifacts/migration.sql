-- AlterTable
ALTER TABLE "report_jobs" ADD COLUMN     "request_key" UUID,
ADD COLUMN     "size_bytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "data_export_jobs" ADD COLUMN     "size_bytes" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "invitation_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reset_id" UUID NOT NULL,
    "ciphertext" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "lease_until" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_deliveries_reset_id_key" ON "invitation_deliveries"("reset_id");

-- CreateIndex
CREATE INDEX "invitation_deliveries_sent_at_expires_at_idx" ON "invitation_deliveries"("sent_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_jobs_tenant_id_requested_by_request_key_key" ON "report_jobs"("tenant_id", "requested_by", "request_key");

ALTER TABLE invitation_deliveries ADD CONSTRAINT invitation_delivery_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE invitation_deliveries ADD CONSTRAINT invitation_delivery_user_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE invitation_deliveries ADD CONSTRAINT invitation_delivery_reset_fk FOREIGN KEY (reset_id) REFERENCES password_resets(id);
ALTER TABLE report_jobs ADD CONSTRAINT report_bytes_nonnegative CHECK(size_bytes >= 0);
ALTER TABLE data_export_jobs ADD CONSTRAINT export_bytes_nonnegative CHECK(size_bytes >= 0);
