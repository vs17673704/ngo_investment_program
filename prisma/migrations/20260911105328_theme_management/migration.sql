-- CreateEnum
CREATE TYPE "ThemeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ThemeConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ThemeStatus" NOT NULL,
    "appName" TEXT,
    "logoUrl" TEXT,
    "loginLogoUrl" TEXT,
    "faviconUrl" TEXT,
    "loginTitle" TEXT,
    "loginSubtitle" TEXT,
    "welcomeText" TEXT,
    "primaryButtonLabel" TEXT,
    "supportText" TEXT,
    "footerText" TEXT,
    "loginBackgroundType" TEXT NOT NULL DEFAULT 'SOLID',
    "loginBackgroundUrl" TEXT,
    "loginBackgroundPosition" TEXT NOT NULL DEFAULT 'CENTER',
    "loginBackgroundSize" TEXT NOT NULL DEFAULT 'COVER',
    "loginOverlayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loginOverlayColor" TEXT NOT NULL DEFAULT '#000000',
    "loginOverlayOpacity" INTEGER NOT NULL DEFAULT 40,
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "onPrimaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "secondaryColor" TEXT NOT NULL DEFAULT '#006c4a',
    "onSecondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "backgroundColor" TEXT NOT NULL DEFAULT '#fbf8fc',
    "surfaceColor" TEXT NOT NULL DEFAULT '#f0edf1',
    "cardColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textPrimaryColor" TEXT NOT NULL DEFAULT '#1b1b1e',
    "textSecondaryColor" TEXT NOT NULL DEFAULT '#47464a',
    "successColor" TEXT NOT NULL DEFAULT '#006c4a',
    "warningColor" TEXT NOT NULL DEFAULT '#c76c00',
    "errorColor" TEXT NOT NULL DEFAULT '#ba1a1a',
    "infoColor" TEXT NOT NULL DEFAULT '#0b57d0',
    "borderColor" TEXT NOT NULL DEFAULT '#c8c5ca',
    "fontFamily" TEXT NOT NULL DEFAULT 'inter',
    "headingFontFamily" TEXT NOT NULL DEFAULT 'jakarta',
    "baseFontSize" INTEGER NOT NULL DEFAULT 16,
    "borderRadiusPreset" TEXT NOT NULL DEFAULT 'standard',
    "themeMode" TEXT NOT NULL DEFAULT 'LIGHT',
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ThemeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThemeConfig_status_idx" ON "ThemeConfig"("status");

-- CreateIndex
CREATE INDEX "ThemeConfig_version_idx" ON "ThemeConfig"("version");

-- AddForeignKey
ALTER TABLE "ThemeConfig" ADD CONSTRAINT "ThemeConfig_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeConfig" ADD CONSTRAINT "ThemeConfig_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the initial PUBLISHED theme (v1) using today's hardcoded globals.css
-- values, so existing appearance is unchanged immediately after migration.
INSERT INTO "ThemeConfig" (
  "id", "version", "status", "updatedAt", "publishedAt"
) VALUES (
  'theme_v1_default', 1, 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
