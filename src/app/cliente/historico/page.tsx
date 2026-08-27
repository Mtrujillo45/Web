import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge, Select, Input, Button, Field } from "@/components/ui";
import { formatearPrecio } from "@/lib/pricing";
import { formatearFechaBogota, inicioDiaBogota, finDiaBogota } from "@/lib/tiempo";
import { tieneInfoLogistica } from "@/lib/logistica";
import type { Moneda } from "@prisma/client";

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; dropId?: string; estado?: string }>;
}) {
  const { empresa } = await requireEmpresaAprobada();
  const filtros = await searchParams;

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id },
    include: { drop: true, lineas: true },
    orderBy: { creadoEn: "desc" },
  });

  // La numeración "Pedido #N" es estable dentro de cada drop, sin importar los filtros aplicados.
  const numeroPorDrop = new Map<string, number>();
  const conNumero = [...pedidos].reverse().map((pedido) => {
    const n = (numeroPorDrop.get(pedido.dropId) ?? 0) + 1;
    numeroPorDrop.set(pedido.dropId, n);
    return { pedido, numero: n };
  });

  const desdeFecha = filtros.desde ? inicioDiaBogota(filtros.desde) : null;
  const hastaFecha = filtros.hasta ? finDiaBogota(filtros.hasta) : null;
  const filas = [...conNumero]
    .reverse()
    .filter(({ pedido }) => {
      if (filtros.dropId && pedido.dropId !== filtros.dropId) return false;
      if (
        (filtros.estado === "BORRADOR" || filtros.estado === "ENVIADO") &&
        pedido.estado !== filtros.estado
      )
        return false;
      if (desdeFecha && (!pedido.fechaEnvio || pedido.fechaEnvio < desdeFecha)) return false;
      if (hastaFecha && (!pedido.fechaEnvio || pedido.fechaEnvio > hastaFecha)) return false;
      return true;
    });

  const dropsConPedido = Array.from(new Map(pedidos.map((p) => [p.drop.id, p.drop])).values()).sort(
    (a, b) => b.creadoEn.getTime() - a.creadoEn.getTime()
  );

  const totalesPorMoneda: Record<Moneda, { unidades: number; valor: number }> = {
    USD: { unidades: 0, valor: 0 },
    COP: { unidades: 0, valor: 0 },
  };
  let pedidosEnviados = 0;
  for (const { pedido } of filas) {
    if (pedido.estado !== "ENVIADO") continue;
    pedidosEnviados += 1;
    for (const l of pedido.lineas) {
      totalesPorMoneda[pedido.moneda].unidades += l.cantidad;
      totalesPorMoneda[pedido.moneda].valor += l.cantidad * Number(l.precioUnitarioAplicado);
    }
  }

  const hayFiltros = Boolean(filtros.desde || filtros.hasta || filtros.dropId || filtros.estado);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/cliente" className="mb-6 inline-block text-sm font-medium text-brand-700 underline">
        &larr; Volver
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-brand-800">Histórico y total de pedidos</h1>

      <Card className="mb-6">
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
            <Field label="Drop">
              <Select name="dropId" defaultValue={filtros.dropId ?? ""}>
                <option value="">Todos</option>
                {dropsConPedido.map((d) => (
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
            <Link href="/cliente/historico" className="text-sm text-brand-700 underline">
              Limpiar filtros
            </Link>
          )}
        </form>
      </Card>

      <Card className="mb-6 flex flex-wrap gap-8">
        <div>
          <p className="text-xs uppercase text-brand-700">Pedidos enviados</p>
          <p className="text-2xl font-semibold text-brand-800">{pedidosEnviados}</p>
        </div>
        {totalesPorMoneda.USD.unidades > 0 && (
          <div>
            <p className="text-xs uppercase text-brand-700">Total en USD</p>
            <p className="text-2xl font-semibold text-brand-800">
              {totalesPorMoneda.USD.unidades} u. &middot; {formatearPrecio(totalesPorMoneda.USD.valor, "USD")}
            </p>
          </div>
        )}
        {totalesPorMoneda.COP.unidades > 0 && (
          <div>
            <p className="text-xs uppercase text-brand-700">Total en COP</p>
            <p className="text-2xl font-semibold text-brand-800">
              {totalesPorMoneda.COP.unidades} u. &middot; {formatearPrecio(totalesPorMoneda.COP.valor, "COP")}
            </p>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {filas.length === 0 && (
          <Card>
            <p className="text-sm text-brand-700">
              {hayFiltros
                ? "No hay pedidos con estos filtros."
                : "Todavía no has enviado ningún pedido."}
            </p>
          </Card>
        )}
        {filas.map(({ pedido, numero }) => {
          const unidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
          const valor = pedido.lineas.reduce(
            (acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado),
            0
          );
          return (
            <Link key={pedido.id} href={`/cliente/pedido/${pedido.dropId}/${pedido.id}`}>
              <Card className="flex items-center justify-between hover:border-brand-600">
                <div>
                  <p className="font-medium text-brand-800">
                    {pedido.drop.nombre} — Pedido #{numero}
                  </p>
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
                  {pedido.bloqueado && <Badge tono="peligro">Cerrado</Badge>}
                  {tieneInfoLogistica(pedido) && <Badge tono="neutral">Despachado</Badge>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
