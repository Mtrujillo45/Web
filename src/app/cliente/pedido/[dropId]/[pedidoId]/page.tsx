import { notFound } from "next/navigation";
import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { calcularPrecioCliente, precioBasePorMoneda } from "@/lib/pricing";
import { dropCerrado } from "@/lib/pedido-contexto";
import { formatearFechaBogota } from "@/lib/tiempo";
import { tieneInfoLogistica } from "@/lib/logistica";
import { PedidoForm } from "@/components/cliente/pedido-form";
import { Card } from "@/components/ui";

export default async function PedidoDetallePage({
  params,
}: {
  params: Promise<{ dropId: string; pedidoId: string }>;
}) {
  const { dropId, pedidoId } = await params;
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
    where: { id: pedidoId },
    include: { lineas: true },
  });
  if (!pedido || pedido.empresaId !== empresa.id || pedido.dropId !== dropId) notFound();

  const hermanos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id, dropId },
    orderBy: { creadoEn: "asc" },
    select: { id: true },
  });
  const numeroPedido = hermanos.findIndex((p) => p.id === pedido.id) + 1;

  const porcentajeDescuento = empresa.condicion?.porcentajeDescuento ?? 0;
  const moneda = empresa.condicion?.moneda ?? "USD";
  const cerrado = dropCerrado(drop);
  const soloLectura = cerrado || pedido.bloqueado;
  const motivoSoloLectura = pedido.bloqueado ? "bloqueado" : cerrado ? "cerrado" : null;

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
      cantidadActual: pedido.lineas.find((l) => l.varianteId === v.id)?.cantidad ?? 0,
    })),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <Link href={`/cliente/pedido/${drop.id}`} className="text-sm font-medium text-brand-700 underline">
          &larr; Volver a los pedidos de este drop
        </Link>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-brand-800">
        {drop.nombre} — Pedido #{numeroPedido}
      </h1>
      <p className="mb-6 text-sm text-brand-700">Cierra el {formatearFechaBogota(drop.fechaLimite)}</p>
      {tieneInfoLogistica(pedido) && (
        <Card className="mb-6 flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Información de despacho
          </h2>
          {pedido.transportadora && (
            <p className="text-sm text-brand-700">Transportadora: {pedido.transportadora}</p>
          )}
          {pedido.numeroGuia && (
            <p className="text-sm text-brand-700">Número de guía: {pedido.numeroGuia}</p>
          )}
          {pedido.linkSeguimiento && (
            <a
              href={pedido.linkSeguimiento}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 underline"
            >
              Seguir el envío
            </a>
          )}
          {pedido.guiaUrl && (
            <a
              href={pedido.guiaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 underline"
            >
              Ver guía de despacho
            </a>
          )}
        </Card>
      )}
      <PedidoForm
        pedidoId={pedido.id}
        productos={productos}
        moneda={moneda}
        moqTotalPedido={empresa.condicion?.moqTotalPedido ?? null}
        soloLectura={soloLectura}
        motivoSoloLectura={motivoSoloLectura}
        estadoPedido={pedido.estado}
      />
    </main>
  );
}
