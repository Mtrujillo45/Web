import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { calcularPrecioCliente, precioBasePorMoneda, formatearPrecio } from "@/lib/pricing";
import { formatearFechaBogota } from "@/lib/tiempo";
import { Card, Badge } from "@/components/ui";
import { EditorLineasPedido } from "@/components/admin/editor-lineas-pedido";
import { FormularioLogistica } from "@/components/admin/formulario-logistica";
import { BotonBloqueoPedido } from "@/components/admin/boton-bloqueo-pedido";

export default async function PedidoDetalleAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      empresa: { include: { condicion: true } },
      drop: {
        include: {
          productos: {
            orderBy: { referencia: "asc" },
            include: { variantes: { orderBy: { talla: "asc" } } },
          },
        },
      },
      lineas: true,
      historial: { orderBy: { creadoEn: "desc" }, include: { editadoPor: true } },
    },
  });
  if (!pedido) notFound();

  type CambioLinea = { sku: string; talla: string; cantidadAntes: number; cantidadDespues: number };

  const porcentajeDescuento = pedido.empresa.condicion?.porcentajeDescuento ?? 0;

  const productos = pedido.drop.productos.map((producto) => ({
    id: producto.id,
    referencia: producto.referencia,
    nombreReferencia: producto.nombreReferencia,
    variantes: producto.variantes.map((v) => ({
      id: v.id,
      sku: v.sku,
      talla: v.talla,
      precioCliente: calcularPrecioCliente(precioBasePorMoneda(v, pedido.moneda), porcentajeDescuento),
      cantidadActual: pedido.lineas.find((l) => l.varianteId === v.id)?.cantidad ?? 0,
    })),
  }));

  const totalUnidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
  const totalValor = pedido.lineas.reduce(
    (acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/pedidos" className="text-sm font-medium text-brand-700 underline">
        &larr; Volver a pedidos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-brand-800">{pedido.empresa.nombreComercial}</h1>
          <p className="text-sm text-brand-700">
            Drop:{" "}
            <Link href={`/admin/drops/${pedido.drop.id}`} className="underline">
              {pedido.drop.nombre}
            </Link>
          </p>
          <p className="text-sm text-brand-700">
            Creado el {formatearFechaBogota(pedido.creadoEn)}
            {pedido.fechaEnvio && <> &middot; Enviado el {formatearFechaBogota(pedido.fechaEnvio)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tono={pedido.estado === "ENVIADO" ? "exito" : "advertencia"}>
            {pedido.estado === "ENVIADO" ? "Enviado" : "Borrador"}
          </Badge>
          {pedido.bloqueado && <Badge tono="peligro">Cerrado</Badge>}
          {sesion.rol === "COMERCIAL" && (
            <BotonBloqueoPedido pedidoId={pedido.id} bloqueado={pedido.bloqueado} />
          )}
        </div>
      </div>

      <Card className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs uppercase text-brand-700">Unidades</p>
          <p className="text-2xl font-semibold text-brand-800">{totalUnidades}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-brand-700">Valor</p>
          <p className="text-2xl font-semibold text-brand-800">
            {formatearPrecio(totalValor, pedido.moneda)}
          </p>
        </div>
      </Card>

      {pedido.bloqueado && (
        <p className="text-xs text-brand-700">
          Este pedido está cerrado para el cliente, pero comercial puede seguir editándolo aquí.
        </p>
      )}

      {sesion.rol === "COMERCIAL" ? (
        <EditorLineasPedido pedidoId={pedido.id} productos={productos} moneda={pedido.moneda} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-brand-700">
              <tr>
                <th className="px-4 py-2">Referencia</th>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Talla</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {productos.flatMap((producto) =>
                producto.variantes
                  .filter((v) => v.cantidadActual > 0)
                  .map((v) => (
                    <tr key={v.id} className="border-t border-brand-100">
                      <td className="px-4 py-2">{producto.nombreReferencia}</td>
                      <td className="px-4 py-2">{v.sku}</td>
                      <td className="px-4 py-2">{v.talla}</td>
                      <td className="px-4 py-2 text-right">{v.cantidadActual}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <FormularioLogistica
        pedidoId={pedido.id}
        transportadora={pedido.transportadora}
        numeroGuia={pedido.numeroGuia}
        linkSeguimiento={pedido.linkSeguimiento}
        guiaUrl={pedido.guiaUrl}
      />

      {pedido.historial.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Historial de cambios de cantidades
          </h2>
          <div className="flex flex-col gap-3">
            {pedido.historial.map((h) => (
              <Card key={h.id} className="text-sm">
                <p className="mb-1 text-xs text-brand-700">
                  {formatearFechaBogota(h.creadoEn)} &middot; {h.editadoPor.nombre}
                </p>
                <ul className="list-disc pl-4 text-brand-800">
                  {(h.cambios as unknown as CambioLinea[]).map((c, i) => (
                    <li key={i}>
                      {c.sku} (talla {c.talla}): {c.cantidadAntes} &rarr; {c.cantidadDespues}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
