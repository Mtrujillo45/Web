import { Badge } from "@/components/ui";
import { diasHastaCierre } from "@/lib/tiempo";

/** Aviso visual de cuánto falta para el cierre de un drop, para no dejar pasar la fecha límite. */
export function BadgeCierre({ fechaLimite }: { fechaLimite: Date }) {
  const dias = diasHastaCierre(fechaLimite);

  if (dias <= 0) return <Badge tono="peligro">Cierra hoy</Badge>;
  if (dias === 1) return <Badge tono="peligro">Cierra mañana</Badge>;
  if (dias <= 3) return <Badge tono="peligro">Cierra en {dias} días</Badge>;
  if (dias <= 7) return <Badge tono="advertencia">Cierra en {dias} días</Badge>;
  return <Badge tono="neutral">Cierra en {dias} días</Badge>;
}
