-- CreateTable
CREATE TABLE "StoredFileContent" (
    "storedFileId" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "StoredFileContent_pkey" PRIMARY KEY ("storedFileId")
);

-- AddForeignKey
ALTER TABLE "StoredFileContent" ADD CONSTRAINT "StoredFileContent_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
