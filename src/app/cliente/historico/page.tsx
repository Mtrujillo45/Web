import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { formatearPrecio } from "@/lib/pricing";
import { formatearFechaBogota } from "@/lib/tiempo";
import type { Moneda } from "@prisma/client";

export default async function HistoricoPage() {
  const { empresa } = await requireEmpresaAprobada();

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id },
    include: { drop: true, lineas: true },
    orderBy: { creadoEn: "desc" },
  });

  const numeroPorDrop = new Map<string, number>();
  const conNumero = [...pedidos].reverse().map((pedido) => {
    const n = (numeroPorDrop.get(pedido.dropId) ?? 0) + 1;
    numeroPorDrop.set(pedido.dropId, n);
    return { pedido, numero: n };
  });
  const filas = [...conNumero].reverse();

  const totalesPorMoneda: Record<Moneda, { unidades: number; valor: number }> = {
    USD: { unidades: 0, valor: 0 },
    COP: { unidades: 0, valor: 0 },
  };
  let pedidosEnviados = 0;
  for (const pedido of pedidos) {
    if (pedido.estado !== "ENVIADO") continue;
    pedidosEnviados += 1;
    for (const l of pedido.lineas) {
      totalesPorMoneda[pedido.moneda].unidades += l.cantidad;
      totalesPorMoneda[pedido.moneda].valor += l.cantidad * Number(l.precioUnitarioAplicado);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/cliente" className="mb-6 inline-block text-sm font-medium text-brand-700 underline">
        &larr; Volver
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-brand-800">Histórico y total de pedidos</h1>

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
            <p className="text-sm text-brand-700">Todavía no has enviado ningún pedido.</p>
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
                  {pedido.bloqueado && <Badge tono="peligro">Bloqueado</Badge>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
