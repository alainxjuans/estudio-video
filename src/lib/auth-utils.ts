type AuthLikeError = { message?: string; status?: number; name?: string } | null | undefined;

/** Traduce los errores de autenticación a mensajes claros en español. */
export function authErrorMessage(error: AuthLikeError): string {
  if (!error) return "";
  const msg = (error.message ?? "").toLowerCase();
  if (
    error.name === "AuthRetryableFetchError" ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  )
    return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (msg.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos. Revisa que no haya espacios ni mayúsculas de más.";
  if (msg.includes("email not confirmed"))
    return "Aún no has confirmado tu correo. Revisa tu bandeja de entrada (y la carpeta de spam).";
  if (msg.includes("already registered") || msg.includes("already been registered"))
    return "Ya existe una cuenta con este correo. Prueba iniciar sesión.";
  if (msg.includes("password should be") || msg.includes("weak password"))
    return "La contraseña es muy débil. Usa al menos 6 caracteres.";
  if (msg.includes("rate limit") || msg.includes("too many") || error.status === 429)
    return "Demasiados intentos. Espera unos minutos e inténtalo otra vez.";
  if (msg.includes("invalid email") || msg.includes("unable to validate email"))
    return "El correo no parece válido. Revísalo.";
  if (msg.includes("non-2xx")) return "El servidor no pudo completar la operación. Inténtalo de nuevo o revisa los datos.";
  if (msg.includes("phone")) return "Revisa el número de teléfono (por ejemplo +5355555555).";
  return error.message || "Ocurrió un error. Inténtalo de nuevo.";
}

/** Quita espacios, guiones y paréntesis de un teléfono escrito a mano. */
export const cleanPhone = (v: string) => v.replace(/[\s\-().]/g, "");
