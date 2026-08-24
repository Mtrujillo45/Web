import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { ImportadorWizard } from "@/components/admin/importador-wizard";

export default async function ImportarCatalogoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRolPagina(["COMERCIAL"]);

  const drop = await prisma.drop.findUnique({ where: { id } });
  if (!drop) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/drops/${drop.id}`} className="text-sm font-medium text-brand-700 underline">
        &larr; Volver a {drop.nombre}
      </Link>
      <h1 className="text-xl font-semibold text-brand-800">Importar catálogo — {drop.nombre}</h1>
      <ImportadorWizard dropId={drop.id} />
    </div>
  );
}
