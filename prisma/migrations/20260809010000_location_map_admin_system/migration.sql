-- Location map + DIRECTOR role + CMS fields + ops/media

ALTER TYPE "UserRole" ADD VALUE 'DIRECTOR';

ALTER TABLE "Location" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Location" ADD COLUMN "email" TEXT;
ALTER TABLE "Location" ADD COLUMN "routeUrl" TEXT;
ALTER TABLE "Location" ADD COLUMN "mapZoom" INTEGER NOT NULL DEFAULT 16;
ALTER TABLE "Location" ADD COLUMN "mapLabel" TEXT;

ALTER TABLE "SiteSettings" ADD COLUMN "heroBadge" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "heroTitle" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "heroSubtitle" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "heroDescription" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "aboutTitle" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "aboutDescription" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "locationSectionTitle" TEXT DEFAULT 'Где мы находимся?';
ALTER TABLE "SiteSettings" ADD COLUMN "defaultTimezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';
ALTER TABLE "SiteSettings" ADD COLUMN "supportPhone" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "supportEmail" TEXT;

CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalEvent_kind_createdAt_idx" ON "OperationalEvent"("kind", "createdAt");
CREATE INDEX "OperationalEvent_createdAt_idx" ON "OperationalEvent"("createdAt");

CREATE TABLE "MediaObject" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaObject_key_key" ON "MediaObject"("key");
CREATE INDEX "MediaObject_createdAt_idx" ON "MediaObject"("createdAt");
