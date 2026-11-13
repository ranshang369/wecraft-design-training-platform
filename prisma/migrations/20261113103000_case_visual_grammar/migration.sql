ALTER TABLE "CaseVersion" ADD COLUMN "bodyMechanism" TEXT;
ALTER TABLE "CaseVersion" ADD COLUMN "startPoints" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CaseVersion" ADD COLUMN "intentTags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CaseVersion" ADD COLUMN "structureSignature" TEXT;
ALTER TABLE "CaseVersion" ADD COLUMN "visualGrammar" JSONB;
