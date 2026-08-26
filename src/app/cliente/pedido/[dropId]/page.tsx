import { notFound } from "next/navigation";
import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { dropCerrado } from "@/lib/pedido-contexto";
import { formatearFechaBogota } from "@/lib/tiempo";
import { formatearPrecio } from "@/lib/pricing";
import { Card, Badge } from "@/components/ui";
import { BotonNuevoPedido } from "@/components/cliente/boton-nuevo-pedido";

export default async function PedidosDelDropPage({
  params,
}: {
  params: Promise<{ dropId: string }>;
}) {
  const { dropId } = await params;
  const { empresa } = await requireEmpresaAprobada();

  const drop = await prisma.drop.findUnique({ where: { id: dropId } });
  if (!drop) notFound();

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id, dropId },
    include: { lineas: true },
    orderBy: { creadoEn: "asc" },
  });

  const cerrado = dropCerrado(drop);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <Link href="/cliente" className="text-sm font-medium text-brand-700 underline">
          &larr; Volver
        </Link>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-brand-800">{drop.nombre}</h1>
      <p className="mb-6 text-sm text-brand-700">Cierra el {formatearFechaBogota(drop.fechaLimite)}</p>

      {cerrado && (
        <Card className="mb-6">
          <p className="text-sm text-brand-700">Este drop ya cerró y no admite nuevos pedidos.</p>
        </Card>
      )}

      {pedidos.length === 0 && !cerrado && (
        <Card className="mb-6 flex flex-col items-start gap-3">
          <p className="text-sm text-brand-700">Todavía no has armado ningún pedido para este drop.</p>
          <BotonNuevoPedido dropId={drop.id} texto="Armar mi pedido" />
        </Card>
      )}

      {pedidos.length > 0 && (
        <div className="flex flex-col gap-4">
          {!cerrado && (
            <div>
              <BotonNuevoPedido
                dropId={drop.id}
                texto="+ Crear nuevo pedido (restock)"
                variant="secondary"
              />
            </div>
          )}
          {pedidos.map((pedido, i) => {
            const unidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
            const valor = pedido.lineas.reduce(
              (acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado),
              0
            );
            return (
              <Link key={pedido.id} href={`/cliente/pedido/${drop.id}/${pedido.id}`}>
                <Card className="flex items-center justify-between hover:border-brand-600">
                  <div>
                    <p className="font-medium text-brand-800">Pedido #{i + 1}</p>
                    <p className="text-sm text-brand-700">
                      {unidades} unidades &middot; {formatearPrecio(valor, pedido.moneda)}
                    </p>
                    {pedido.fechaEnvio && (
                      <p className="text-xs text-brand-700">
                        Enviado el {formatearFechaBogota(pedido.fechaEnvio)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tono={pedido.estado === "ENVIADO" ? "exito" : "advertencia"}>
                      {pedido.estado === "ENVIADO" ? "Enviado" : "Borrador"}
                    </Badge>
                    {pedido.bloqueado && <Badge tono="peligro">Bloqueado</Badge>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
