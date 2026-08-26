import Link from "next/link";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatearPrecio } from "@/lib/pricing";
import { formatearFechaBogota, inicioDiaBogota, finDiaBogota } from "@/lib/tiempo";
import { Card, Select, Input, Button, Field, Badge } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    empresaId?: string;
    dropId?: string;
    estado?: string;
  }>;
}) {
  await requireRolPagina(["COMERCIAL", "PRODUCCION"]);
  const filtros = await searchParams;

  const [empresas, drops] = await Promise.all([
    prisma.empresa.findMany({ where: { estado: "APROBADO" }, orderBy: { nombreComercial: "asc" } }),
    prisma.drop.findMany({ orderBy: { creadoEn: "desc" } }),
  ]);

  const where: Prisma.PedidoWhereInput = {
    ...(filtros.empresaId ? { empresaId: filtros.empresaId } : {}),
    ...(filtros.dropId ? { dropId: filtros.dropId } : {}),
    ...(filtros.estado === "BORRADOR" || filtros.estado === "ENVIADO"
      ? { estado: filtros.estado }
      : {}),
    ...(filtros.desde || filtros.hasta
      ? {
          fechaEnvio: {
            ...(filtros.desde ? { gte: inicioDiaBogota(filtros.desde) } : {}),
            ...(filtros.hasta ? { lte: finDiaBogota(filtros.hasta) } : {}),
          },
        }
      : {}),
  };

  const pedidos = await prisma.pedido.findMany({
    where,
    include: { empresa: true, drop: true, lineas: true },
    orderBy: [{ fechaEnvio: "desc" }, { creadoEn: "desc" }],
  });

  const hayFiltros = Boolean(
    filtros.desde || filtros.hasta || filtros.empresaId || filtros.dropId || filtros.estado
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-brand-800">Pedidos</h1>

      <Card>
        <form className="flex flex-wrap items-end gap-4" method="GET">
          <div className="w-40">
            <Field label="Desde">
              <Input type="date" name="desde" defaultValue={filtros.desde ?? ""} />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Hasta">
              <Input type="date" name="hasta" defaultValue={filtros.hasta ?? ""} />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Cliente">
              <Select name="empresaId" defaultValue={filtros.empresaId ?? ""}>
                <option value="">Todos</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombreComercial}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-56">
            <Field label="Drop">
              <Select name="dropId" defaultValue={filtros.dropId ?? ""}>
                <option value="">Todos</option>
                {drops.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Estado">
              <Select name="estado" defaultValue={filtros.estado ?? ""}>
                <option value="">Todos</option>
                <option value="ENVIADO">Enviado</option>
                <option value="BORRADOR">Borrador</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">Filtrar</Button>
          {hayFiltros && (
            <Link href="/admin/pedidos" className="text-sm text-brand-700 underline">
              Limpiar filtros
            </Link>
          )}
        </form>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase text-brand-700">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Drop</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Unidades</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Fecha envío</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-brand-700">
                  No hay pedidos con estos filtros.
                </td>
              </tr>
            )}
            {pedidos.map((pedido) => {
              const unidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
              const valor = pedido.lineas.reduce(
                (acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado),
                0
              );
              const tieneLogistica = Boolean(
                pedido.transportadora || pedido.numeroGuia || pedido.guiaUrl || pedido.linkSeguimiento
              );
              return (
                <tr key={pedido.id} className="border-t border-brand-100">
                  <td className="px-4 py-2">{pedido.empresa.nombreComercial}</td>
                  <td className="px-4 py-2">{pedido.drop.nombre}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tono={pedido.estado === "ENVIADO" ? "exito" : "advertencia"}>
                        {pedido.estado === "ENVIADO" ? "Enviado" : "Borrador"}
                      </Badge>
                      {pedido.bloqueado && <Badge tono="peligro">Cerrado</Badge>}
                      {tieneLogistica && <Badge tono="neutral">Despachado</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">{unidades}</td>
                  <td className="px-4 py-2 text-right">{formatearPrecio(valor, pedido.moneda)}</td>
                  <td className="px-4 py-2">
                    {pedido.fechaEnvio ? formatearFechaBogota(pedido.fechaEnvio) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="text-sm font-medium text-brand-700 underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
