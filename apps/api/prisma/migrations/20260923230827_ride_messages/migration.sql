-- CreateTable
CREATE TABLE "RideMessage" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RideMessage_rideId_idx" ON "RideMessage"("rideId");

-- AddForeignKey
ALTER TABLE "RideMessage" ADD CONSTRAINT "RideMessage_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
