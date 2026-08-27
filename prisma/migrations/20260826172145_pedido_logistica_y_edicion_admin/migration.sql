-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "editadoEn" TIMESTAMP(3),
ADD COLUMN     "editadoPorId" TEXT,
ADD COLUMN     "guiaUrl" TEXT,
ADD COLUMN     "linkSeguimiento" TEXT,
ADD COLUMN     "numeroGuia" TEXT,
ADD COLUMN     "transportadora" TEXT;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
