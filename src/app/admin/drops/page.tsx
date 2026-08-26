import Link from "next/link";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { FormularioCrearDrop } from "@/components/admin/formulario-crear-drop";
import { formatearFechaBogota } from "@/lib/tiempo";

const TONO_ESTADO = { BORRADOR: "neutral", ACTIVO: "exito", CERRADO: "peligro" } as const;

export default async function DropsPage() {
  const sesion = await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  const drops = await prisma.drop.findMany({
    orderBy: { creadoEn: "desc" },
    include: { _count: { select: { productos: true, pedidos: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      {sesion.rol === "COMERCIAL" && <FormularioCrearDrop />}

      <div className="flex flex-col gap-4">
        {drops.length === 0 && (
          <Card>
            <p className="text-sm text-brand-700">Todavía no se ha creado ningún drop.</p>
          </Card>
        )}
        {drops.map((drop) => (
          <Link key={drop.id} href={`/admin/drops/${drop.id}`}>
            <Card className="flex items-center justify-between hover:border-brand-600">
              <div>
                <p className="font-medium text-brand-800">{drop.nombre}</p>
                <p className="text-sm text-brand-700">
                  {drop._count.productos} referencias &middot; {drop._count.pedidos} pedidos &middot;
                  cierra el {formatearFechaBogota(drop.fechaLimite, { dateStyle: "medium" })}
                </p>
              </div>
              <Badge tono={TONO_ESTADO[drop.estado]}>{drop.estado}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
