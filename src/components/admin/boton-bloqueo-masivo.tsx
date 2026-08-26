"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function BotonBloqueoMasivo({
  empresaId,
  dropId,
  algunoDesbloqueado,
}: {
  empresaId: string;
  dropId: string;
  algunoDesbloqueado: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    try {
      await fetch("/api/admin/pedidos/bloqueo-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, dropId, bloqueado: algunoDesbloqueado }),
      });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button variant="secondary" disabled={enviando} onClick={alternar}>
      {enviando ? "..." : algunoDesbloqueado ? "Bloquear todos" : "Desbloquear todos"}
    </Button>
  );
}
