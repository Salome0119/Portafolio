import { NextResponse } from "next/server";

/**
 * ============================================================
 *  API — Formulario de contacto → Brevo (SMTP API v3)
 * --------------------------------------------------------
 *  El envío ocurre 100% en servidor: la API key nunca se
 *  expone al navegador. Configura las variables en .env.local
 * ============================================================
 */

type Payload = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  /** Honeypot: los bots llenan campos ocultos */
  website?: string;
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });

const singleLine = (value: string) => value.replace(/\s+/g, " ").trim();

export async function POST(request: Request) {
  let body: Payload;

  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido en la petición." },
      { status: 400 },
    );
  }

  const honeypot = (body.website ?? "").trim();
  if (/^https?:\/\//i.test(honeypot)) {
    console.info("Contacto: descartado por honeypot");
    return NextResponse.json({ ok: true });
  }

  const name = singleLine((body.name ?? "").trim().slice(0, 80));
  const email = (body.email ?? "").trim().slice(0, 120);
  const subject = singleLine(
    (body.subject ?? "Contacto desde el portafolio").trim().slice(0, 140),
  );
  const message = (body.message ?? "").trim().slice(0, 4000);

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Escribe tu nombre (mínimo 2 caracteres).";
  if (!emailRe.test(email)) errors.email = "Ingresa un correo válido.";
  if (message.length < 10) errors.message = "Cuéntame un poco más (mínimo 10 caracteres).";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 422 });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const toEmail = process.env.BREVO_CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL || "";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || toEmail;
  const senderName = process.env.BREVO_SENDER_NAME || "Portafolio";

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "El servicio de correo no está configurado." },
      { status: 503 },
    );
  }

  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    subject: escapeHtml(subject),
    message: escapeHtml(message).replace(/\n/g, "<br />"),
  };

  const htmlContent = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#0b0f1a;color:#e2e8f0;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;border:1px solid rgba(16,185,129,.25);border-radius:16px;padding:24px;background:#0f172a;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.2em;color:#34d399;text-transform:uppercase;">Nuevo mensaje · Portafolio</p>
      <h1 style="margin:0 0 20px;font-size:22px;color:#f1f5f9;">${safe.subject}</h1>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#6ee7b7;">Nombre:</strong> ${safe.name}</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#6ee7b7;">Email:</strong> <a href="mailto:${safe.email}" style="color:#6ee7b7;">${safe.email}</a></p>
      <hr style="border:0;border-top:1px solid rgba(255,255,255,.1);margin:20px 0;" />
      <div style="font-size:15px;line-height:1.7;">${safe.message}</div>
    </div>
  </body>
</html>`;

  const textContent = [
    `Nombre: ${name}`,
    `Email: ${email}`,
    `Asunto: ${subject}`,
    "",
    message,
  ].join("\n");

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: "Salome" }],
    replyTo: { email, name },
    subject: `[Portafolio] ${subject}`,
    htmlContent,
    textContent,
  });

  let response: Response | null = null;
  let lastError = "unknown";
  let lastStatus: number | null = null;
  let lastAttempt = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    lastAttempt = attempt;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
        cache: "no-store",
      });
      lastStatus = response.status;

      if (response.ok) break;

      const detail = (await response.json().catch(() => null)) as {
        message?: string;
        code?: string;
      } | null;
      lastError =
        `HTTP ${response.status} ${detail?.code ?? ""} ${detail?.message ?? ""}`.trim();
      if (response.status < 500) break;
    } catch (error) {
      response = null;
      lastError = error instanceof Error ? error.message : "unknown";
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  if (!response?.ok) {
    console.error("Contacto: fallo al enviar", {
      status: lastStatus,
      detail: lastError,
      attempt: lastAttempt,
    });
    const detail = lastError.toLowerCase();
    let error = "No se pudo enviar el correo. Intenta nuevamente en unos minutos.";
    if (detail.includes("429") || detail.includes("quota") || detail.includes("limit")) {
      error = "Se alcanzó el límite de envíos de Brevo. Intenta más tarde.";
    } else if (
      detail.includes("401") ||
      detail.includes("403") ||
      detail.includes("unauthorized") ||
      detail.includes("permission") ||
      detail.includes("api key")
    ) {
      error = "La API key de Brevo no es válida o no tiene permisos.";
    } else if (detail.includes("sender")) {
      error = "El remitente configurado en Brevo no está verificado.";
    }
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }

  const delivered = (await response.json().catch(() => null)) as {
    messageId?: string;
  } | null;
  console.info("Brevo SMTP enviado:", delivered?.messageId ?? "sin messageId");

  return NextResponse.json({
    ok: true,
    message: "Mensaje enviado correctamente.",
  });
}
