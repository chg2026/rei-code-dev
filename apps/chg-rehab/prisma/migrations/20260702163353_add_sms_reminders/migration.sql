-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York';

-- CreateTable
CREATE TABLE "WsReminderSms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "userId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "leadLabel" TEXT,
    "minutesBefore" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WsReminderSms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WsReminderSms_status_scheduledFor_idx" ON "WsReminderSms"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "WsReminderSms_reminderId_idx" ON "WsReminderSms"("reminderId");

-- CreateIndex
CREATE INDEX "WsReminderSms_companyId_idx" ON "WsReminderSms"("companyId");

-- AddForeignKey
ALTER TABLE "WsReminderSms" ADD CONSTRAINT "WsReminderSms_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "WsReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WsReminderSms" ADD CONSTRAINT "WsReminderSms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WsReminderSms" ADD CONSTRAINT "WsReminderSms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

