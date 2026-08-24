-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('USD', 'COP');

-- AlterTable
ALTER TABLE "CondicionComercial" ADD COLUMN     "moneda" "Moneda" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "LineaPedido" ALTER COLUMN "precioUnitarioAplicado" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "moneda" "Moneda" NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Variante" ADD COLUMN     "precioBaseCop" DECIMAL(14,2),
ALTER COLUMN "precioBaseUsd" DROP NOT NULL;
