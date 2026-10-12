-- CreateTable
CREATE TABLE "match_ratings" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "rater_id" TEXT NOT NULL,
    "ratee_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_ratings_ratee_id_idx" ON "match_ratings"("ratee_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_ratings_match_id_rater_id_key" ON "match_ratings"("match_id", "rater_id");

-- AddForeignKey
ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
