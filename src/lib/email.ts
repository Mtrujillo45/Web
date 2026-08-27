import "server-only";

/**
 * Envío de correo vía la API de Resend. Si no hay RESEND_API_KEY configurada
 * (por ejemplo en desarrollo local), no falla: solo lo deja registrado en el log
 * para no bloquear el flujo de pedidos por un problema de notificaciones.
 */
export async function enviarCorreo(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY no configurada; se omite el correo "${params.subject}"`);
    return;
  }

  const from = process.env.EMAIL_FROM || "Mompossina Pedidos <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      console.error("Error enviando correo:", res.status, await res.text());
    }
  } catch (error) {
    console.error("Error enviando correo:", error);
  }
}
