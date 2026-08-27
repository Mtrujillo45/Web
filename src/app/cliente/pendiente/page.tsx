import { redirect } from "next/navigation";
import { requireRolPagina } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { Card, Badge } from "@/components/ui";
import { BotonCerrarSesion } from "@/components/boton-cerrar-sesion";

const COPIA_ESTADO: Record<string, { titulo: string; texto: string; tono: "advertencia" | "peligro" }> = {
  PENDIENTE: {
    titulo: "Tu cuenta está en revisión",
    texto:
      "Recibimos el registro de tu empresa. El equipo comercial de Mompossina va a revisarlo y a asignarte tus condiciones comerciales. Te avisaremos por correo cuando esté lista.",
    tono: "advertencia",
  },
  RECHAZADO: {
    titulo: "Tu registro no fue aprobado",
    texto: "Contacta a tu asesor comercial de Mompossina para más información.",
    tono: "peligro",
  },
  SUSPENDIDO: {
    titulo: "Tu cuenta está suspendida",
    texto: "Contacta a tu asesor comercial de Mompossina para más información.",
    tono: "peligro",
  },
};

export default async function PendientePage() {
  const sesion = await requireRolPagina(["CLIENTE"]);
  const empresa = await prisma.empresa.findUnique({ where: { id: sesion.empresaId! } });
  if (!empresa) redirect("/login");
  if (empresa.estado === "APROBADO") redirect("/cliente");

  const copia = COPIA_ESTADO[empresa.estado];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <Card className="w-full text-center">
        <div className="mb-4 flex justify-center">
          <Badge tono={copia.tono}>{empresa.estado}</Badge>
        </div>
        <h1 className="mb-2 text-lg font-semibold text-brand-800">{copia.titulo}</h1>
        <p className="mb-6 text-sm text-brand-700">{copia.texto}</p>
        <BotonCerrarSesion />
      </Card>
    </main>
  );
}
