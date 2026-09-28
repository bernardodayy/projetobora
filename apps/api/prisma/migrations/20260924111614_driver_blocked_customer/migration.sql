-- CreateTable
CREATE TABLE "DriverBlockedCustomer" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverBlockedCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverBlockedCustomer_driverId_idx" ON "DriverBlockedCustomer"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverBlockedCustomer_driverId_customerId_key" ON "DriverBlockedCustomer"("driverId", "customerId");

-- AddForeignKey
ALTER TABLE "DriverBlockedCustomer" ADD CONSTRAINT "DriverBlockedCustomer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverBlockedCustomer" ADD CONSTRAINT "DriverBlockedCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
