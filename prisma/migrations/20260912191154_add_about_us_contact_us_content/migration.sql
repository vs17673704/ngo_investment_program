-- CreateTable
CREATE TABLE "AboutUsSectionDraft" (
    "id" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutUsSectionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AboutUsSectionPublished" (
    "id" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AboutUsSectionPublished_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUsContent" (
    "id" TEXT NOT NULL,
    "draftAddress" TEXT,
    "draftPhone" TEXT,
    "draftEmail" TEXT,
    "draftWebsite" TEXT,
    "draftSocialLinks" JSONB,
    "publishedAddress" TEXT,
    "publishedPhone" TEXT,
    "publishedEmail" TEXT,
    "publishedWebsite" TEXT,
    "publishedSocialLinks" JSONB,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUsContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AboutUsSectionDraft_order_idx" ON "AboutUsSectionDraft"("order");

-- CreateIndex
CREATE INDEX "AboutUsSectionPublished_order_idx" ON "AboutUsSectionPublished"("order");
