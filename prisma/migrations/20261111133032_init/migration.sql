-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('OWNER', 'ADMIN', 'DESIGN_LEAD', 'CONTENT_LEAD', 'EDITOR', 'ANNOTATOR', 'AI_ENGINEER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BriefPurpose" AS ENUM ('CASE_SOURCE', 'GOLDEN_EVAL', 'BOTH');

-- CreateEnum
CREATE TYPE "Split" AS ENUM ('DEV', 'HOLDOUT');

-- CreateEnum
CREATE TYPE "Archetype" AS ENUM ('SELF_REFERENTIAL', 'MATERIAL', 'SCENE', 'GENRE', 'SCHEMA', 'INTERFACE', 'CITATION', 'PSYCHOLOGICAL', 'PROCESS');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'ARBITRATION', 'CHANGES_REQUESTED', 'ELIGIBLE', 'REJECTED', 'QUARANTINED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CounterexampleStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'ARBITRATION', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'QUARANTINED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('SCREENSHOT_375', 'SCREENSHOT_DESKTOP', 'HTML', 'SOURCE', 'THUMBNAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "AuthSubjectType" AS ENUM ('CASE', 'COUNTEREXAMPLE', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('MISSING', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReviewTaskType" AS ENUM ('CASE_REVIEW', 'COUNTEREXAMPLE_REVIEW', 'ARBITRATION', 'BLIND_PAIRWISE');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewRole" AS ENUM ('REVIEWER', 'ADJUDICATOR');

-- CreateEnum
CREATE TYPE "ReviewRecommendation" AS ENUM ('PUBLISHABLE', 'NOT_PUBLISHABLE', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ReviewVersionStatus" AS ENUM ('SUBMITTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewEvidenceType" AS ENUM ('SCREENSHOT_REGION', 'HTML_FRAGMENT', 'MANUSCRIPT_EXCERPT');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'HARD_CHECKING', 'HARD_CHECK_FAILED', 'READY_FOR_BLIND', 'IN_BLIND', 'COMPLETED', 'WITHDRAWN', 'DISQUALIFIED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "HardCheckRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "HardCheckSeverity" AS ENUM ('BLOCK', 'WARN', 'INFO');

-- CreateEnum
CREATE TYPE "HardCheckStatus" AS ENUM ('PASS', 'FAIL', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'FROZEN', 'RUNNING', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperimentPairStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Preference" AS ENUM ('LEFT', 'RIGHT', 'TIE');

-- CreateEnum
CREATE TYPE "DatasetType" AS ENUM ('TRAIN', 'EVAL');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('DRAFT', 'VALIDATING', 'BLOCKED', 'READY_FOR_APPROVAL', 'APPROVED', 'EXPORTING', 'READY', 'FAILED', 'REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DatasetFormat" AS ENUM ('WECRAFT_V1', 'CSV_SUMMARY');

-- CreateEnum
CREATE TYPE "DatasetItemType" AS ENUM ('BRIEF', 'CASE', 'COUNTEREXAMPLE', 'CANDIDATE', 'PREFERENCE');

-- CreateEnum
CREATE TYPE "DatasetItemStatus" AS ENUM ('READY', 'QUARANTINED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "DatasetExportStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'FEISHU', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LegalHoldScope" AS ENUM ('WORKSPACE', 'CASE', 'COUNTEREXAMPLE', 'CANDIDATE', 'DATASET', 'FILE');

-- CreateEnum
CREATE TYPE "LegalHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRole" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "MemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roleCode" "RoleCode" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "briefNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "purpose" "BriefPurpose" NOT NULL DEFAULT 'CASE_SOURCE',
    "split" "Split" NOT NULL DEFAULT 'DEV',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerId" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefVersion" (
    "id" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "manuscriptMarkdown" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "targetAudience" TEXT NOT NULL,
    "designCommission" TEXT NOT NULL,
    "brandRequirements" TEXT NOT NULL,
    "prohibitedItems" TEXT NOT NULL,
    "userIntent" TEXT,
    "hardConstraints" JSONB,
    "acceptableArchetypes" JSONB,
    "mustAvoid" JSONB,
    "humanReference" JSONB,
    "rubricTargets" JSONB,
    "acceptanceNotes" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "caseNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "archetype" "Archetype" NOT NULL,
    "briefId" UUID,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "quarantineReason" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseVersion" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "applicableConditions" TEXT NOT NULL,
    "designMechanism" TEXT NOT NULL,
    "antiPatterns" JSONB NOT NULL DEFAULT '[]',
    "mechanismTags" JSONB NOT NULL DEFAULT '[]',
    "selfScores" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAsset" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "caseVersionId" UUID NOT NULL,
    "storedFileId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterexample" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "counterexampleNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CounterexampleStatus" NOT NULL DEFAULT 'DRAFT',
    "archetype" "Archetype" NOT NULL,
    "briefId" UUID,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Counterexample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterexampleVersion" (
    "id" UUID NOT NULL,
    "counterexampleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "failureSummary" TEXT NOT NULL,
    "failureLabels" JSONB NOT NULL,
    "reproductionSteps" TEXT NOT NULL,
    "rootCause" TEXT,
    "repairSuggestion" TEXT NOT NULL,
    "applicableConditions" JSONB NOT NULL DEFAULT '[]',
    "sourceType" TEXT NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterexampleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterexampleAsset" (
    "id" UUID NOT NULL,
    "counterexampleId" UUID NOT NULL,
    "counterexampleVersionId" UUID NOT NULL,
    "storedFileId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterexampleAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationGrant" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "subjectType" "AuthSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "canDeriveMechanism" BOOLEAN NOT NULL DEFAULT false,
    "canUseForGeneration" BOOLEAN NOT NULL DEFAULT false,
    "canUseForDisplay" BOOLEAN NOT NULL DEFAULT false,
    "canUseForTraining" BOOLEAN NOT NULL DEFAULT false,
    "canUseForEvaluation" BOOLEAN NOT NULL DEFAULT false,
    "canShowPublicly" BOOLEAN NOT NULL DEFAULT false,
    "evidenceStatus" "EvidenceStatus" NOT NULL DEFAULT 'MISSING',
    "evidenceNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationEvent" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "type" "ReviewTaskType" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "subjectVersionId" UUID,
    "experimentPairId" UUID,
    "assigneeId" UUID NOT NULL,
    "reviewRole" "ReviewRole" NOT NULL DEFAULT 'REVIEWER',
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'PENDING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "assignedBy" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "blindPolicySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseReview" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "caseVersionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ReviewVersionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "recommendation" "ReviewRecommendation" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rationale" TEXT,
    "supersedesId" UUID,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterexampleReview" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "counterexampleId" UUID NOT NULL,
    "counterexampleVersionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ReviewVersionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "recommendation" "ReviewRecommendation" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rationale" TEXT,
    "supersedesId" UUID,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterexampleReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewScore" (
    "id" UUID NOT NULL,
    "caseReviewId" UUID,
    "counterexampleReviewId" UUID,
    "dimensionCode" TEXT NOT NULL,
    "score" INTEGER,
    "isNa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvidence" (
    "id" UUID NOT NULL,
    "caseReviewId" UUID,
    "counterexampleReviewId" UUID,
    "evidenceType" "ReviewEvidenceType" NOT NULL,
    "locator" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,

    CONSTRAINT "ReviewEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "malwareScanStatus" TEXT NOT NULL DEFAULT 'CLEAN',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "candidateNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "briefId" UUID NOT NULL,
    "experimentId" UUID,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "CandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateVersion" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAsset" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "candidateVersionId" UUID NOT NULL,
    "storedFileId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardCheckRun" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "candidateVersionId" UUID NOT NULL,
    "status" "HardCheckRunStatus" NOT NULL DEFAULT 'QUEUED',
    "rulesetVersion" TEXT NOT NULL DEFAULT 'v1',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardCheck" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "severity" "HardCheckSeverity" NOT NULL,
    "status" "HardCheckStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "experimentNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "rubricVersion" TEXT NOT NULL DEFAULT 'v1',
    "protocol" JSONB NOT NULL,
    "seedHash" TEXT,
    "startsAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentBrief" (
    "id" UUID NOT NULL,
    "experimentId" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "briefVersionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentPair" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "experimentId" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "pairNo" TEXT NOT NULL,
    "leftCandidateId" UUID NOT NULL,
    "leftCandidateVersionId" UUID NOT NULL,
    "leftContentHash" TEXT NOT NULL,
    "rightCandidateId" UUID NOT NULL,
    "rightCandidateVersionId" UUID NOT NULL,
    "rightContentHash" TEXT NOT NULL,
    "isHighValue" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExperimentPairStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairwiseComparison" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "experimentId" UUID NOT NULL,
    "experimentPairId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "presentedLeftCandidateId" UUID NOT NULL,
    "presentedRightCandidateId" UUID NOT NULL,
    "preference" "Preference" NOT NULL,
    "preferredCandidateId" UUID,
    "rationale" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "blindPayloadHash" TEXT NOT NULL,
    "presentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" UUID,
    "status" "ReviewVersionStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "PairwiseComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairwiseScore" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "dimensionCode" TEXT NOT NULL,
    "score" INTEGER,
    "isNa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PairwiseScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "datasetNo" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "type" "DatasetType" NOT NULL,
    "status" "DatasetStatus" NOT NULL DEFAULT 'DRAFT',
    "format" "DatasetFormat" NOT NULL DEFAULT 'WECRAFT_V1',
    "rubricVersion" TEXT NOT NULL DEFAULT 'v1',
    "filterSnapshot" JSONB NOT NULL DEFAULT '{}',
    "rightsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "eligibilitySnapshot" JSONB NOT NULL DEFAULT '{}',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "manifestHash" TEXT,
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "revokedBy" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetItem" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "itemType" "DatasetItemType" NOT NULL,
    "briefId" UUID,
    "caseId" UUID,
    "counterexampleId" UUID,
    "candidateId" UUID,
    "comparisonId" UUID,
    "split" "Split",
    "status" "DatasetItemStatus" NOT NULL DEFAULT 'READY',
    "exclusionReason" TEXT,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rightsSnapshot" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetExport" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "datasetVersion" INTEGER NOT NULL,
    "exportNo" TEXT NOT NULL,
    "format" "DatasetFormat" NOT NULL,
    "status" "DatasetExportStatus" NOT NULL DEFAULT 'PENDING',
    "fileId" UUID,
    "manifestFileId" UUID,
    "contentHash" TEXT,
    "sizeBytes" BIGINT,
    "exportedBy" UUID NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "lastDownloadedBy" UUID,
    "revokedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "prevHash" TEXT,
    "entryHash" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "deepLink" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "scopeType" "LegalHoldScope" NOT NULL,
    "scopeId" UUID,
    "status" "LegalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "approvedBy" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" UUID,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRole_membershipId_roleId_key" ON "MemberRole"("membershipId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_email_idx" ON "Invitation"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Brief_workspaceId_split_status_idx" ON "Brief"("workspaceId", "split", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_workspaceId_briefNo_key" ON "Brief"("workspaceId", "briefNo");

-- CreateIndex
CREATE UNIQUE INDEX "BriefVersion_briefId_version_key" ON "BriefVersion"("briefId", "version");

-- CreateIndex
CREATE INDEX "Case_workspaceId_status_archetype_idx" ON "Case"("workspaceId", "status", "archetype");

-- CreateIndex
CREATE UNIQUE INDEX "Case_workspaceId_caseNo_key" ON "Case"("workspaceId", "caseNo");

-- CreateIndex
CREATE UNIQUE INDEX "CaseVersion_caseId_version_key" ON "CaseVersion"("caseId", "version");

-- CreateIndex
CREATE INDEX "CaseAsset_caseVersionId_kind_idx" ON "CaseAsset"("caseVersionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Counterexample_workspaceId_counterexampleNo_key" ON "Counterexample"("workspaceId", "counterexampleNo");

-- CreateIndex
CREATE UNIQUE INDEX "CounterexampleVersion_counterexampleId_version_key" ON "CounterexampleVersion"("counterexampleId", "version");

-- CreateIndex
CREATE INDEX "CounterexampleAsset_counterexampleVersionId_kind_idx" ON "CounterexampleAsset"("counterexampleVersionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationGrant_subjectType_subjectId_key" ON "AuthorizationGrant"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AuthorizationEvent_grantId_createdAt_idx" ON "AuthorizationEvent"("grantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewTask_workspaceId_assigneeId_status_idx" ON "ReviewTask"("workspaceId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "ReviewTask_type_subjectId_idx" ON "ReviewTask"("type", "subjectId");

-- CreateIndex
CREATE INDEX "CaseReview_caseId_reviewerId_idx" ON "CaseReview"("caseId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseReview_taskId_version_key" ON "CaseReview"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CounterexampleReview_taskId_version_key" ON "CounterexampleReview"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewScore_caseReviewId_dimensionCode_key" ON "ReviewScore"("caseReviewId", "dimensionCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewScore_counterexampleReviewId_dimensionCode_key" ON "ReviewScore"("counterexampleReviewId", "dimensionCode");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");

-- CreateIndex
CREATE INDEX "Candidate_experimentId_status_idx" ON "Candidate"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_workspaceId_candidateNo_key" ON "Candidate"("workspaceId", "candidateNo");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateVersion_candidateId_version_key" ON "CandidateVersion"("candidateId", "version");

-- CreateIndex
CREATE INDEX "CandidateAsset_candidateVersionId_kind_idx" ON "CandidateAsset"("candidateVersionId", "kind");

-- CreateIndex
CREATE INDEX "HardCheckRun_candidateId_startedAt_idx" ON "HardCheckRun"("candidateId", "startedAt");

-- CreateIndex
CREATE INDEX "HardCheck_runId_ruleId_idx" ON "HardCheck"("runId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_workspaceId_experimentNo_key" ON "Experiment"("workspaceId", "experimentNo");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentBrief_experimentId_briefId_key" ON "ExperimentBrief"("experimentId", "briefId");

-- CreateIndex
CREATE INDEX "ExperimentPair_experimentId_status_idx" ON "ExperimentPair"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentPair_experimentId_pairNo_key" ON "ExperimentPair"("experimentId", "pairNo");

-- CreateIndex
CREATE INDEX "PairwiseComparison_experimentPairId_reviewerId_idx" ON "PairwiseComparison"("experimentPairId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "PairwiseComparison_taskId_version_key" ON "PairwiseComparison"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PairwiseScore_comparisonId_side_dimensionCode_key" ON "PairwiseScore"("comparisonId", "side", "dimensionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_workspaceId_datasetNo_version_key" ON "Dataset"("workspaceId", "datasetNo", "version");

-- CreateIndex
CREATE INDEX "DatasetItem_datasetId_itemType_idx" ON "DatasetItem"("datasetId", "itemType");

-- CreateIndex
CREATE INDEX "DatasetExport_datasetId_createdAt_idx" ON "DatasetExport"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetExport_datasetId_exportNo_key" ON "DatasetExport"("datasetId", "exportNo");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_occurredAt_idx" ON "AuditLog"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_occurredAt_idx" ON "AuditLog"("action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefVersion" ADD CONSTRAINT "BriefVersion_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseVersion" ADD CONSTRAINT "CaseVersion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAsset" ADD CONSTRAINT "CaseAsset_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAsset" ADD CONSTRAINT "CaseAsset_caseVersionId_fkey" FOREIGN KEY ("caseVersionId") REFERENCES "CaseVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAsset" ADD CONSTRAINT "CaseAsset_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterexample" ADD CONSTRAINT "Counterexample_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterexample" ADD CONSTRAINT "Counterexample_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleVersion" ADD CONSTRAINT "CounterexampleVersion_counterexampleId_fkey" FOREIGN KEY ("counterexampleId") REFERENCES "Counterexample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleAsset" ADD CONSTRAINT "CounterexampleAsset_counterexampleId_fkey" FOREIGN KEY ("counterexampleId") REFERENCES "Counterexample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleAsset" ADD CONSTRAINT "CounterexampleAsset_counterexampleVersionId_fkey" FOREIGN KEY ("counterexampleVersionId") REFERENCES "CounterexampleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleAsset" ADD CONSTRAINT "CounterexampleAsset_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationGrant" ADD CONSTRAINT "AuthorizationGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationEvent" ADD CONSTRAINT "AuthorizationEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AuthorizationGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReview" ADD CONSTRAINT "CaseReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReviewTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReview" ADD CONSTRAINT "CaseReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReview" ADD CONSTRAINT "CaseReview_caseVersionId_fkey" FOREIGN KEY ("caseVersionId") REFERENCES "CaseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleReview" ADD CONSTRAINT "CounterexampleReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReviewTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleReview" ADD CONSTRAINT "CounterexampleReview_counterexampleId_fkey" FOREIGN KEY ("counterexampleId") REFERENCES "Counterexample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterexampleReview" ADD CONSTRAINT "CounterexampleReview_counterexampleVersionId_fkey" FOREIGN KEY ("counterexampleVersionId") REFERENCES "CounterexampleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewScore" ADD CONSTRAINT "ReviewScore_caseReviewId_fkey" FOREIGN KEY ("caseReviewId") REFERENCES "CaseReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewScore" ADD CONSTRAINT "ReviewScore_counterexampleReviewId_fkey" FOREIGN KEY ("counterexampleReviewId") REFERENCES "CounterexampleReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvidence" ADD CONSTRAINT "ReviewEvidence_caseReviewId_fkey" FOREIGN KEY ("caseReviewId") REFERENCES "CaseReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvidence" ADD CONSTRAINT "ReviewEvidence_counterexampleReviewId_fkey" FOREIGN KEY ("counterexampleReviewId") REFERENCES "CounterexampleReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateVersion" ADD CONSTRAINT "CandidateVersion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAsset" ADD CONSTRAINT "CandidateAsset_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAsset" ADD CONSTRAINT "CandidateAsset_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "CandidateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAsset" ADD CONSTRAINT "CandidateAsset_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardCheckRun" ADD CONSTRAINT "HardCheckRun_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardCheckRun" ADD CONSTRAINT "HardCheckRun_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "CandidateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardCheck" ADD CONSTRAINT "HardCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HardCheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentBrief" ADD CONSTRAINT "ExperimentBrief_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentBrief" ADD CONSTRAINT "ExperimentBrief_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentPair" ADD CONSTRAINT "ExperimentPair_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_experimentPairId_fkey" FOREIGN KEY ("experimentPairId") REFERENCES "ExperimentPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseComparison" ADD CONSTRAINT "PairwiseComparison_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ReviewTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairwiseScore" ADD CONSTRAINT "PairwiseScore_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "PairwiseComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetItem" ADD CONSTRAINT "DatasetItem_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetExport" ADD CONSTRAINT "DatasetExport_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
