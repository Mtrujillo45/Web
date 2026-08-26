"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function BotonBloqueoPedido({ pedidoId, bloqueado }: { pedidoId: string; bloqueado: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function alternar() {
    setEnviando(true);
    try {
      await fetch(`/api/admin/pedidos/${pedidoId}/bloqueo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bloqueado: !bloqueado }),
      });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button variant={bloqueado ? "secondary" : "danger"} disabled={enviando} onClick={alternar}>
      {enviando ? "..." : bloqueado ? "Desbloquear" : "Bloquear"}
    </Button>
  );
}
