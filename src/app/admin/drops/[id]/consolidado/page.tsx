import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { obtenerDatosConsolidado } from "@/lib/consolidado";
import { Card, Badge } from "@/components/ui";

export default async function ConsolidadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  const drop = await prisma.drop.findUnique({ where: { id } });
  if (!drop) notFound();

  const { consolidado, resumenPorCliente, pendientesDeEnvio } = await obtenerDatosConsolidado(id);

  const totalUnidades = consolidado.reduce((acc, f) => acc + f.totalUnidades, 0);
  const totalValor = consolidado.reduce((acc, f) => acc + f.totalUnidades * f.precioBaseUsd, 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/drops/${drop.id}`} className="text-sm font-medium text-brand-700 underline">
        &larr; Volver a {drop.nombre}
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-800">Consolidado — {drop.nombre}</h1>
        <a href={`/api/admin/drops/${drop.id}/exportar`}>
          <button className="inline-flex items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            Descargar Excel
          </button>
        </a>
      </div>

      <Card className="flex gap-8">
        <div>
          <p className="text-xs uppercase text-brand-700">Total unidades enviadas</p>
          <p className="text-2xl font-semibold text-brand-800">{totalUnidades}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-brand-700">Valor total (a precio base)</p>
          <p className="text-2xl font-semibold text-brand-800">${totalValor.toFixed(2)}</p>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Consolidado por referencia y talla
        </h2>
        <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase text-brand-700">
              <tr>
                <th className="px-4 py-2">Referencia</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Talla</th>
                <th className="px-4 py-2 text-right">Unidades</th>
                <th className="px-4 py-2 text-right">Valor USD</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-brand-700">
                    Todavía no hay pedidos enviados para este drop.
                  </td>
                </tr>
              )}
              {consolidado.map((fila) => (
                <tr key={fila.sku} className="border-t border-brand-100">
                  <td className="px-4 py-2">{fila.referencia}</td>
                  <td className="px-4 py-2">{fila.nombreReferencia}</td>
                  <td className="px-4 py-2">{fila.sku}</td>
                  <td className="px-4 py-2">{fila.talla}</td>
                  <td className="px-4 py-2 text-right">{fila.totalUnidades}</td>
                  <td className="px-4 py-2 text-right">
                    ${(fila.totalUnidades * fila.precioBaseUsd).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Por cliente
        </h2>
        <div className="flex flex-col gap-3">
          {resumenPorCliente.length === 0 && (
            <Card>
              <p className="text-sm text-brand-700">Ningún cliente ha enviado pedido todavía.</p>
            </Card>
          )}
          {resumenPorCliente.map((r) => (
            <Card key={r.empresa} className="flex items-center justify-between">
              <p className="font-medium text-brand-800">{r.empresa}</p>
              <p className="text-sm text-brand-700">
                {r.unidades} unidades &middot; ${r.valor.toFixed(2)} USD
              </p>
            </Card>
          ))}
        </div>
      </div>

      {pendientesDeEnvio.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Aprobados sin pedido enviado <Badge tono="advertencia">{pendientesDeEnvio.length}</Badge>
          </h2>
          <Card>
            <p className="text-sm text-brand-700">{pendientesDeEnvio.join(", ")}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
