import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge, Button } from "@/components/ui";
import { AccionesDrop } from "@/components/admin/acciones-drop";
import { formatearPrecio } from "@/lib/pricing";

const TONO_ESTADO = { BORRADOR: "neutral", ACTIVO: "exito", CERRADO: "peligro" } as const;

export default async function DropDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  const drop = await prisma.drop.findUnique({
    where: { id },
    include: {
      productos: { include: { variantes: true }, orderBy: { referencia: "asc" } },
    },
  });
  if (!drop) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/drops" className="text-sm font-medium text-brand-700 underline">
        &larr; Volver a drops
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold text-brand-800">{drop.nombre}</h1>
            <Badge tono={TONO_ESTADO[drop.estado]}>{drop.estado}</Badge>
          </div>
          <p className="text-sm text-brand-700">
            Cierra el{" "}
            {new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short" }).format(
              drop.fechaLimite
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-3">
            {sesion.rol === "COMERCIAL" && (
              <Link href={`/admin/drops/${drop.id}/importar`}>
                <Button variant="secondary">Importar catálogo</Button>
              </Link>
            )}
            <Link href={`/admin/drops/${drop.id}/consolidado`}>
              <Button variant="secondary">Ver consolidado</Button>
            </Link>
          </div>
          {sesion.rol === "COMERCIAL" && (
            <AccionesDrop dropId={drop.id} estado={drop.estado} tieneProductos={drop.productos.length > 0} />
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700">
          Catálogo ({drop.productos.length} referencias)
        </h2>
        <div className="flex flex-col gap-3">
          {drop.productos.length === 0 && (
            <Card>
              <p className="text-sm text-brand-700">Todavía no se ha importado ningún catálogo.</p>
            </Card>
          )}
          {drop.productos.map((producto) => (
            <Card key={producto.id} className="flex items-center gap-4">
              {producto.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={producto.fotoUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md bg-brand-100 text-[10px] text-brand-700">
                  Sin foto
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-brand-800">{producto.nombreReferencia}</p>
                <p className="text-xs text-brand-700">
                  Ref. {producto.referencia} &middot; {producto.variantes.length} tallas
                  {producto.moqReferencia ? ` · mínimo ${producto.moqReferencia} u.` : ""}
                </p>
              </div>
              <div className="text-right text-sm text-brand-700">
                {producto.variantes[0]?.precioBaseUsd != null && (
                  <p>{formatearPrecio(Number(producto.variantes[0].precioBaseUsd), "USD")}</p>
                )}
                {producto.variantes[0]?.precioBaseCop != null && (
                  <p>{formatearPrecio(Number(producto.variantes[0].precioBaseCop), "COP")}</p>
                )}
                {producto.variantes[0]?.precioBaseUsd == null &&
                  producto.variantes[0]?.precioBaseCop == null && <p>Sin precio</p>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
