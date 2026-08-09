-- CMS hero CTA / about benefits / gallery caption + media link
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "heroCtaLabel" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "heroCtaHref" TEXT DEFAULT '#booking';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "heroActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "aboutEyebrow" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "aboutBenefits" JSONB;

ALTER TABLE "GalleryItem" ADD COLUMN IF NOT EXISTS "caption" TEXT;
ALTER TABLE "GalleryItem" ADD COLUMN IF NOT EXISTS "mediaObjectId" TEXT;

CREATE INDEX IF NOT EXISTS "GalleryItem_mediaObjectId_idx" ON "GalleryItem"("mediaObjectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GalleryItem_mediaObjectId_fkey'
  ) THEN
    ALTER TABLE "GalleryItem"
      ADD CONSTRAINT "GalleryItem_mediaObjectId_fkey"
      FOREIGN KEY ("mediaObjectId") REFERENCES "MediaObject"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
