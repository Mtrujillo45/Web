"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Field, Input, Alerta } from "@/components/ui";
import { Logo } from "@/components/logo";

const CAMPOS_INICIALES = {
  nombreComercial: "",
  razonSocial: "",
  nitOCedula: "",
  pais: "",
  ciudad: "",
  telefono: "",
  emailContacto: "",
  nombre: "",
  email: "",
  password: "",
};

export default function RegistroPage() {
  const router = useRouter();
  const [campos, setCampos] = useState(CAMPOS_INICIALES);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function actualizar(campo: keyof typeof CAMPOS_INICIALES) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((c) => ({ ...c, [campo]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar el registro");
        return;
      }
      router.push("/cliente/pendiente");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8 h-10" />
      <Card className="w-full">
        <h1 className="mb-1 text-xl font-semibold text-brand-800">Registrar mi empresa</h1>
        <p className="mb-6 text-sm text-brand-700">
          Tu cuenta quedará pendiente de revisión. El equipo comercial la aprobará y te asignará
          tus condiciones comerciales antes de que puedas ver el catálogo.
        </p>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <Alerta>{error}</Alerta>
            </div>
          )}
          <Field label="Nombre comercial de la empresa">
            <Input required value={campos.nombreComercial} onChange={actualizar("nombreComercial")} />
          </Field>
          <Field label="Razón social (opcional)">
            <Input value={campos.razonSocial} onChange={actualizar("razonSocial")} />
          </Field>
          <Field label="NIT o número de identificación">
            <Input required value={campos.nitOCedula} onChange={actualizar("nitOCedula")} />
          </Field>
          <Field label="País">
            <Input required value={campos.pais} onChange={actualizar("pais")} />
          </Field>
          <Field label="Ciudad (opcional)">
            <Input value={campos.ciudad} onChange={actualizar("ciudad")} />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input value={campos.telefono} onChange={actualizar("telefono")} />
          </Field>
          <Field label="Correo de contacto de la empresa">
            <Input type="email" required value={campos.emailContacto} onChange={actualizar("emailContacto")} />
          </Field>
          <div className="sm:col-span-2 border-t border-brand-100 pt-4">
            <p className="mb-4 text-sm font-medium text-brand-800">Tu usuario de acceso</p>
          </div>
          <Field label="Tu nombre">
            <Input required value={campos.nombre} onChange={actualizar("nombre")} />
          </Field>
          <Field label="Correo para iniciar sesión">
            <Input type="email" required value={campos.email} onChange={actualizar("email")} />
          </Field>
          <Field label="Contraseña (mínimo 8 caracteres)">
            <Input
              type="password"
              required
              minLength={8}
              value={campos.password}
              onChange={actualizar("password")}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={enviando} className="w-full">
              {enviando ? "Enviando..." : "Crear cuenta"}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-brand-700">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-brand-800 underline">
            Ingresa aquí
          </Link>
        </p>
      </Card>
    </main>
  );
}
