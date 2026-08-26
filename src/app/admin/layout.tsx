import Link from "next/link";
import { requireRolPagina } from "@/lib/guards";
import { BotonCerrarSesion } from "@/components/boton-cerrar-sesion";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireRolPagina(["COMERCIAL", "PRODUCCION"]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <nav className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold text-brand-800">
              Mompossina admin
            </Link>
            {sesion.rol === "COMERCIAL" && (
              <>
                <Link href="/admin/clientes" className="text-sm text-brand-700 hover:text-brand-800">
                  Clientes
                </Link>
                <Link href="/admin/drops" className="text-sm text-brand-700 hover:text-brand-800">
                  Drops
                </Link>
              </>
            )}
            {sesion.rol === "PRODUCCION" && (
              <Link href="/admin/drops" className="text-sm text-brand-700 hover:text-brand-800">
                Consolidados
              </Link>
            )}
            <Link href="/admin/dashboard" className="text-sm text-brand-700 hover:text-brand-800">
              Dashboard
            </Link>
          </nav>
          <BotonCerrarSesion />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
