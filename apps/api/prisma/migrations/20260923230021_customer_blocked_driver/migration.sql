-- CreateTable
CREATE TABLE "CustomerBlockedDriver" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBlockedDriver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBlockedDriver_customerId_idx" ON "CustomerBlockedDriver"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBlockedDriver_customerId_driverId_key" ON "CustomerBlockedDriver"("customerId", "driverId");

-- AddForeignKey
ALTER TABLE "CustomerBlockedDriver" ADD CONSTRAINT "CustomerBlockedDriver_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBlockedDriver" ADD CONSTRAINT "CustomerBlockedDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
