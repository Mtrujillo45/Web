-- DropIndex
DROP INDEX "Pedido_empresaId_dropId_key";

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "bloqueado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bloqueadoEn" TIMESTAMP(3),
ADD COLUMN     "bloqueadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "Pedido_empresaId_dropId_idx" ON "Pedido"("empresaId", "dropId");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_bloqueadoPorId_fkey" FOREIGN KEY ("bloqueadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
