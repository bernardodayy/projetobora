-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "DriverRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverRefreshToken_tokenHash_key" ON "DriverRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DriverRefreshToken_driverId_idx" ON "DriverRefreshToken"("driverId");

-- AddForeignKey
ALTER TABLE "DriverRefreshToken" ADD CONSTRAINT "DriverRefreshToken_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
