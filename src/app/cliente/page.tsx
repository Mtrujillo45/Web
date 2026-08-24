import Link from "next/link";
import { requireEmpresaAprobada } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge, Button } from "@/components/ui";
import { BotonCerrarSesion } from "@/components/boton-cerrar-sesion";

function formatearFecha(fecha: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(fecha);
}

export default async function ClientePage() {
  const { empresa } = await requireEmpresaAprobada();

  const dropsActivos = await prisma.drop.findMany({
    where: { estado: "ACTIVO" },
    orderBy: { fechaLimite: "asc" },
  });

  const pedidos = await prisma.pedido.findMany({
    where: { empresaId: empresa.id, drop: { estado: "ACTIVO" } },
  });
  const pedidoPorDrop = new Map(pedidos.map((p) => [p.dropId, p]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-800">Hola, {empresa.nombreComercial}</h1>
          <p className="text-sm text-brand-700">Este es tu portal de pedidos Mompossina</p>
        </div>
        <BotonCerrarSesion />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
        Drops activos
      </h2>
      <div className="mb-8 flex flex-col gap-4">
        {dropsActivos.length === 0 && (
          <Card>
            <p className="text-sm text-brand-700">No hay ningún drop activo en este momento.</p>
          </Card>
        )}
        {dropsActivos.map((drop) => {
          const pedido = pedidoPorDrop.get(drop.id);
          return (
            <Card key={drop.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-brand-800">{drop.nombre}</p>
                <p className="text-sm text-brand-700">
                  Cierra el {formatearFecha(drop.fechaLimite)}
                </p>
                {pedido && (
                  <div className="mt-1">
                    <Badge tono={pedido.estado === "ENVIADO" ? "exito" : "advertencia"}>
                      {pedido.estado === "ENVIADO" ? "Pedido enviado" : "Borrador sin enviar"}
                    </Badge>
                  </div>
                )}
              </div>
              <Link href={`/cliente/pedido/${drop.id}`}>
                <Button>{pedido ? "Ver / editar pedido" : "Armar pedido"}</Button>
              </Link>
            </Card>
          );
        })}
      </div>

      <Link href="/cliente/historico" className="text-sm font-medium text-brand-800 underline">
        Ver histórico de pedidos
      </Link>
    </main>
  );
}
