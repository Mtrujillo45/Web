-- CreateTable
CREATE TABLE "HistorialPedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "editadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cambios" JSONB NOT NULL,

    CONSTRAINT "HistorialPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistorialPedido_pedidoId_idx" ON "HistorialPedido"("pedidoId");

-- AddForeignKey
ALTER TABLE "HistorialPedido" ADD CONSTRAINT "HistorialPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialPedido" ADD CONSTRAINT "HistorialPedido_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
