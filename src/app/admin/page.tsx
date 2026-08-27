import Link from "next/link";
import { requireRolPagina } from "@/lib/guards";
import { Card } from "@/components/ui";

export default async function AdminHomePage() {
  const sesion = await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {sesion.rol === "COMERCIAL" && (
        <Link href="/admin/clientes">
          <Card className="hover:border-brand-600">
            <h2 className="font-medium text-brand-800">Clientes</h2>
            <p className="text-sm text-brand-700">Aprobar registros y editar condiciones comerciales</p>
          </Card>
        </Link>
      )}
      <Link href="/admin/drops">
        <Card className="hover:border-brand-600">
          <h2 className="font-medium text-brand-800">Drops</h2>
          <p className="text-sm text-brand-700">
            {sesion.rol === "COMERCIAL"
              ? "Crear drops, importar catálogo y ver el consolidado"
              : "Ver y exportar el consolidado de pedidos"}
          </p>
        </Card>
      </Link>
      <Link href="/admin/pedidos">
        <Card className="hover:border-brand-600">
          <h2 className="font-medium text-brand-800">Pedidos</h2>
          <p className="text-sm text-brand-700">
            Buscar y revisar pedidos puntuales, con filtros de fecha, cliente y drop
          </p>
        </Card>
      </Link>
      <Link href="/admin/dashboard">
        <Card className="hover:border-brand-600">
          <h2 className="font-medium text-brand-800">Dashboard</h2>
          <p className="text-sm text-brand-700">
            Totales de pedidos con filtros de fecha, cliente y drop
          </p>
        </Card>
      </Link>
    </div>
  );
}
