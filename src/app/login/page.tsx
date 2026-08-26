"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Field, Input, Alerta } from "@/components/ui";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión");
        return;
      }
      router.push(data.destino ?? "/");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <Logo className="mb-8 h-10" />
      <Card className="w-full">
        <h1 className="mb-6 text-xl font-semibold text-brand-800">Ingresar</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <Alerta>{error}</Alerta>}
          <Field label="Correo">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-brand-700">
          ¿Eres un cliente nuevo?{" "}
          <Link href="/registro" className="font-medium text-brand-800 underline">
            Regístrate aquí
          </Link>
        </p>
      </Card>
    </main>
  );
}
