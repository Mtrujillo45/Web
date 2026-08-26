import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatearPrecio } from "@/lib/pricing";
import { formatearFechaBogota, inicioDiaBogota, finDiaBogota } from "@/lib/tiempo";
import { Card, Select, Input, Button, Field } from "@/components/ui";
import type { Moneda } from "@prisma/client";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; empresaId?: string; dropId?: string }>;
}) {
  await requireRolPagina(["COMERCIAL", "PRODUCCION"]);
  const filtros = await searchParams;

  const [empresas, drops] = await Promise.all([
    prisma.empresa.findMany({ where: { estado: "APROBADO" }, orderBy: { nombreComercial: "asc" } }),
    prisma.drop.findMany({ orderBy: { creadoEn: "desc" } }),
  ]);

  const pedidos = await prisma.pedido.findMany({
    where: {
      estado: "ENVIADO",
      ...(filtros.empresaId ? { empresaId: filtros.empresaId } : {}),
      ...(filtros.dropId ? { dropId: filtros.dropId } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            fechaEnvio: {
              ...(filtros.desde ? { gte: inicioDiaBogota(filtros.desde) } : {}),
              ...(filtros.hasta ? { lte: finDiaBogota(filtros.hasta) } : {}),
            },
          }
        : {}),
    },
    include: { empresa: true, drop: true, lineas: true },
  });

  const totalesPorMoneda: Record<Moneda, number> = { USD: 0, COP: 0 };
  const unidadesPorMoneda: Record<Moneda, number> = { USD: 0, COP: 0 };
  const rankingMap = new Map<
    string,
    { empresa: string; unidades: number; valorUsd: number; valorCop: number; pedidos: number }
  >();

  for (const pedido of pedidos) {
    const unidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
    const valor = pedido.lineas.reduce((acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado), 0);
    totalesPorMoneda[pedido.moneda] += valor;
    unidadesPorMoneda[pedido.moneda] += unidades;

    const actual = rankingMap.get(pedido.empresaId) ?? {
      empresa: pedido.empresa.nombreComercial,
      unidades: 0,
      valorUsd: 0,
      valorCop: 0,
      pedidos: 0,
    };
    actual.unidades += unidades;
    actual.pedidos += 1;
    if (pedido.moneda === "USD") actual.valorUsd += valor;
    else actual.valorCop += valor;
    rankingMap.set(pedido.empresaId, actual);
  }

  const ranking = Array.from(rankingMap.values()).sort((a, b) => b.unidades - a.unidades);
  const totalPedidos = pedidos.length;
  const totalUnidades = unidadesPorMoneda.USD + unidadesPorMoneda.COP;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-brand-800">Dashboard de pedidos</h1>

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
          <Button type="submit">Filtrar</Button>
          {(filtros.desde || filtros.hasta || filtros.empresaId || filtros.dropId) && (
            <a href="/admin/dashboard" className="text-sm text-brand-700 underline">
              Limpiar filtros
            </a>
          )}
        </form>
      </Card>

      <Card className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs uppercase text-brand-700">Pedidos enviados</p>
          <p className="text-2xl font-semibold text-brand-800">{totalPedidos}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-brand-700">Unidades totales</p>
          <p className="text-2xl font-semibold text-brand-800">{totalUnidades}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-brand-700">Valor total USD</p>
          <p className="text-2xl font-semibold text-brand-800">
            {formatearPrecio(totalesPorMoneda.USD, "USD")}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-brand-700">Valor total COP</p>
          <p className="text-2xl font-semibold text-brand-800">
            {formatearPrecio(totalesPorMoneda.COP, "COP")}
          </p>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Ranking de clientes
        </h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-brand-700">
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2 text-right">Pedidos</th>
                <th className="px-4 py-2 text-right">Unidades</th>
                <th className="px-4 py-2 text-right">Valor USD</th>
                <th className="px-4 py-2 text-right">Valor COP</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-brand-700">
                    No hay pedidos enviados con estos filtros.
                  </td>
                </tr>
              )}
              {ranking.map((r) => (
                <tr key={r.empresa} className="border-t border-brand-100">
                  <td className="px-4 py-2">{r.empresa}</td>
                  <td className="px-4 py-2 text-right">{r.pedidos}</td>
                  <td className="px-4 py-2 text-right">{r.unidades}</td>
                  <td className="px-4 py-2 text-right">
                    {r.valorUsd > 0 ? formatearPrecio(r.valorUsd, "USD") : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.valorCop > 0 ? formatearPrecio(r.valorCop, "COP") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(filtros.desde || filtros.hasta) && (
        <p className="text-xs text-brand-700">
          Rango filtrado en hora Bogotá: {filtros.desde ? formatearFechaBogota(inicioDiaBogota(filtros.desde), { dateStyle: "medium" }) : "sin inicio"}
          {" — "}
          {filtros.hasta ? formatearFechaBogota(finDiaBogota(filtros.hasta), { dateStyle: "medium" }) : "sin fin"}
        </p>
      )}
    </div>
  );
}
