-- DropIndex
DROP INDEX "Variante_sku_key";

-- CreateIndex
CREATE INDEX "Variante_sku_idx" ON "Variante"("sku");
