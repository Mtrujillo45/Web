import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";

export default async function HistoricoPage() {
  const { empresa } = await requireEmpresaAprobada();

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id },
    include: { drop: true, lineas: true },
    orderBy: { drop: { fechaLimite: "desc" } },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/cliente" className="mb-6 inline-block text-sm font-medium text-brand-700 underline">
        &larr; Volver
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-brand-800">Histórico de pedidos</h1>
      <div className="flex flex-col gap-4">
        {pedidos.length === 0 && (
          <Card>
            <p className="text-sm text-brand-700">Todavía no has enviado ningún pedido.</p>
          </Card>
        )}
        {pedidos.map((pedido) => {
          const unidades = pedido.lineas.reduce((acc, l) => acc + l.cantidad, 0);
          const valor = pedido.lineas.reduce(
            (acc, l) => acc + l.cantidad * Number(l.precioUnitarioAplicado),
            0
          );
          return (
            <Link key={pedido.id} href={`/cliente/pedido/${pedido.dropId}`}>
              <Card className="flex items-center justify-between hover:border-brand-600">
                <div>
                  <p className="font-medium text-brand-800">{pedido.drop.nombre}</p>
                  <p className="text-sm text-brand-700">
                    {unidades} unidades &middot; ${valor.toFixed(2)} USD
                  </p>
                </div>
                <Badge tono={pedido.estado === "ENVIADO" ? "exito" : "advertencia"}>
                  {pedido.estado === "ENVIADO" ? "Enviado" : "Borrador"}
                </Badge>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
