import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth";
import { Button, Card } from "@/components/ui";

export default async function Home() {
  const sesion = await obtenerSesion();
  if (sesion) {
    redirect(sesion.rol === "CLIENTE" ? "/cliente" : "/admin");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <Card className="w-full text-center">
        <h1 className="mb-1 text-2xl font-semibold text-brand-800">Mompossina</h1>
        <p className="mb-6 text-sm text-brand-700">Portal de pedidos mayoristas</p>
        <div className="flex flex-col gap-3">
          <Link href="/login">
            <Button className="w-full">Ingresar</Button>
          </Link>
          <Link href="/registro">
            <Button variant="secondary" className="w-full">
              Registrar mi empresa
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
