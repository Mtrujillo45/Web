/**
 * Mompossina opera desde Bogotá (UTC-5, sin horario de verano). Todas las fechas que
 * el usuario ve o escribe en la app deben tratarse en esta zona horaria explícitamente,
 * sin depender de la zona del navegador o del servidor donde corra el contenedor.
 */
export const ZONA_HORARIA_BOGOTA = "America/Bogota";
const OFFSET_BOGOTA = "-05:00";

/** Formatea una fecha/hora en horario de Bogotá, sin importar dónde corra el servidor. */
export function formatearFechaBogota(
  fecha: Date,
  opciones: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" }
): string {
  return new Intl.DateTimeFormat("es-CO", { ...opciones, timeZone: ZONA_HORARIA_BOGOTA }).format(fecha);
}

/**
 * Convierte el valor de un <input type="datetime-local"> (p. ej. "2026-08-30T14:00")
 * a un Date absoluto, interpretando ese texto como hora de Bogotá — sin importar en
 * qué zona horaria esté el navegador de quien lo escribió.
 */
export function datetimeLocalABogota(valor: string): Date {
  return new Date(`${valor}${OFFSET_BOGOTA}`);
}

/** Inicio (00:00:00) de un día calendario de Bogotá, como instante absoluto. */
export function inicioDiaBogota(fechaYYYYMMDD: string): Date {
  return new Date(`${fechaYYYYMMDD}T00:00:00${OFFSET_BOGOTA}`);
}

/** Fin (23:59:59.999) de un día calendario de Bogotá, como instante absoluto. */
export function finDiaBogota(fechaYYYYMMDD: string): Date {
  return new Date(`${fechaYYYYMMDD}T23:59:59.999${OFFSET_BOGOTA}`);
}
