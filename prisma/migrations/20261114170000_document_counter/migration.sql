CREATE TABLE "DocumentCounter" (
    "workspaceId" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("workspaceId", "prefix")
);

ALTER TABLE "DocumentCounter"
  ADD CONSTRAINT "DocumentCounter_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'BR', MAX(SUBSTRING("briefNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Brief"
WHERE "briefNo" ~ '^BR-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'CA', MAX(SUBSTRING("caseNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Case"
WHERE "caseNo" ~ '^CA-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'CE', MAX(SUBSTRING("counterexampleNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Counterexample"
WHERE "counterexampleNo" ~ '^CE-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'CD', MAX(SUBSTRING("candidateNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Candidate"
WHERE "candidateNo" ~ '^CD-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'EX', MAX(SUBSTRING("experimentNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Experiment"
WHERE "experimentNo" ~ '^EX-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
SELECT "workspaceId", 'DS', MAX(SUBSTRING("datasetNo" FROM 4)::INTEGER), CURRENT_TIMESTAMP
FROM "Dataset"
WHERE "datasetNo" ~ '^DS-[0-9]+$'
GROUP BY "workspaceId"
ON CONFLICT ("workspaceId", "prefix") DO UPDATE
SET "value" = GREATEST("DocumentCounter"."value", EXCLUDED."value"), "updatedAt" = CURRENT_TIMESTAMP;
