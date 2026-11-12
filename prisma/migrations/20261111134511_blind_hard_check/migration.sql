-- AlterTable
ALTER TABLE "PairwiseComparison" ADD COLUMN     "hardCheckAcknowledged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hardCheckNotes" TEXT;
