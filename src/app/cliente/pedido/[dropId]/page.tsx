import { notFound } from "next/navigation";
import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { calcularPrecioCliente, precioBasePorMoneda } from "@/lib/pricing";
import { PedidoForm } from "@/components/cliente/pedido-form";

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ dropId: string }>;
}) {
  const { dropId } = await params;
  const { empresa } = await requireEmpresaAprobada();

  const drop = await prisma.drop.findUnique({
    where: { id: dropId },
    include: {
      productos: {
        orderBy: { referencia: "asc" },
        include: { variantes: { orderBy: { talla: "asc" } } },
      },
    },
  });
  if (!drop) notFound();

  const pedido = await prisma.pedido.findUnique({
    where: { empresaId_dropId: { empresaId: empresa.id, dropId } },
    include: { lineas: true },
  });

  const porcentajeDescuento = empresa.condicion?.porcentajeDescuento ?? 0;
  const moneda = empresa.condicion?.moneda ?? "USD";
  const soloLectura = drop.estado === "CERRADO" || new Date() > drop.fechaLimite;

  const productos = drop.productos.map((producto) => ({
    id: producto.id,
    referencia: producto.referencia,
    nombreReferencia: producto.nombreReferencia,
    fotoUrl: producto.fotoUrl,
    moqReferencia: producto.moqReferencia,
    variantes: producto.variantes.map((v) => ({
      id: v.id,
      sku: v.sku,
      talla: v.talla,
      precioCliente: calcularPrecioCliente(precioBasePorMoneda(v, moneda), porcentajeDescuento),
      cantidadActual:
        pedido?.lineas.find((l) => l.varianteId === v.id)?.cantidad ?? 0,
    })),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <Link href="/cliente" className="text-sm font-medium text-brand-700 underline">
          &larr; Volver
        </Link>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-brand-800">{drop.nombre}</h1>
      <p className="mb-6 text-sm text-brand-700">
        Cierra el{" "}
        {new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short" }).format(
          drop.fechaLimite
        )}
      </p>
      <PedidoForm
        dropId={drop.id}
        productos={productos}
        moneda={moneda}
        moqTotalPedido={empresa.condicion?.moqTotalPedido ?? null}
        soloLectura={soloLectura}
        estadoPedido={pedido?.estado ?? "BORRADOR"}
      />
    </main>
  );
}
