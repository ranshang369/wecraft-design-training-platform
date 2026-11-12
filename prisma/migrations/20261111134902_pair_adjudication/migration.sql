-- AlterTable
ALTER TABLE "ExperimentPair" ADD COLUMN     "adjudicatedAt" TIMESTAMP(3),
ADD COLUMN     "adjudicatedBy" UUID,
ADD COLUMN     "adjudicatedPreference" "Preference",
ADD COLUMN     "adjudicationReason" TEXT;
