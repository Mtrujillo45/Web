import { cloneElement, isValidElement, useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

function cn(...clases: Array<string | false | undefined>) {
  return clases.filter(Boolean).join(" ");
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base = "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variantes = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    secondary: "bg-white text-brand-800 border border-brand-100 hover:bg-brand-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-brand-700 hover:bg-brand-100",
  };
  return <button className={cn(base, variantes[variant], className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-brand-800 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-brand-800 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-brand-100 bg-white px-3 py-2 text-sm text-brand-800 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-brand-800", className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {child}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-brand-100 bg-white p-6 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tono = "neutral",
}: {
  children: React.ReactNode;
  tono?: "neutral" | "exito" | "advertencia" | "peligro";
}) {
  const tonos = {
    neutral: "bg-brand-100 text-brand-700",
    exito: "bg-green-100 text-green-800",
    advertencia: "bg-amber-100 text-amber-800",
    peligro: "bg-red-100 text-red-800",
  };
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", tonos[tono])}>
      {children}
    </span>
  );
}

export function Alerta({ tipo = "error", children }: { tipo?: "error" | "exito"; children: React.ReactNode }) {
  const estilos =
    tipo === "error"
      ? "bg-red-50 text-red-800 border border-red-200"
      : "bg-green-50 text-green-800 border border-green-200";
  return <div className={cn("rounded-md px-4 py-3 text-sm", estilos)}>{children}</div>;
}
