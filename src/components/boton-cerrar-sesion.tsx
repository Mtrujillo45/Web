"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function BotonCerrarSesion() {
  const router = useRouter();
  async function cerrarSesion() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" onClick={cerrarSesion}>
      Cerrar sesión
    </Button>
  );
}
