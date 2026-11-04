import { test, expect, type Page } from "@playwright/test";

// Pruebas con sesión iniciada. Usa una cuenta de PRUEBA, nunca la de un usuario real:
//   TEST_EMAIL=prueba@ejemplo.com TEST_PASSWORD=... npx playwright test
// Opcional: TEST_PLAN_AVANZADO=1 si esa cuenta tiene plan con mapa avanzado y puede publicar.
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "Define TEST_EMAIL y TEST_PASSWORD para correr estas pruebas");

async function entrar(page: Page) {
  await page.goto("/login");
  await page.locator("#id").fill(EMAIL!);
  await page.locator("#pw").fill(PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeEach(async ({ page }) => {
  await entrar(page);
});

test("Descubrir carga sin mostrar el aviso de error", async ({ page }) => {
  await page.goto("/explorar");
  await expect(page.getByRole("tab", { name: /Propiedades/ })).toBeVisible();
  await expect(page.getByText("No pudimos cargar los resultados")).toHaveCount(0);
});

test("Favoritos carga sin mostrar el aviso de error", async ({ page }) => {
  await page.goto("/favoritos");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("No pudimos cargar tus favoritos")).toHaveCount(0);
});

test("Planes: la ventana de pago muestra el botón Copiar (sin enviar ningún pago)", async ({ page }) => {
  await page.goto("/planes");
  await page.getByRole("button", { name: /Pagar destacada/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Si hay cuentas bancarias configuradas, aparece el botón de copiar
  await expect(page.getByRole("dialog").getByRole("button", { name: /Copiar/ }).first()).toBeVisible();
});

test("Detalle de propiedad: en móvil el botón de contacto queda a la vista", async ({ page, isMobile }) => {
  test.skip(!isMobile, "solo aplica en el proyecto móvil");
  await page.goto("/explorar");
  const primera = page.locator('a[href^="/propiedad/"]').first();
  await expect(primera).toBeVisible();
  await primera.click();
  // No aparece si la propiedad es de la cuenta de prueba (dueño)
  await expect(page.getByRole("button", { name: /Escribir al arrendador/ })).toBeVisible();
});

test.describe("con plan avanzado", () => {
  test.skip(process.env.TEST_PLAN_AVANZADO !== "1", "Define TEST_PLAN_AVANZADO=1 para estas pruebas");

  test("Mapa: se ven los mosaicos reales (no la marca de clave de API)", async ({ page }) => {
    const mosaico = page.waitForResponse((r) => r.url().includes("tile.openstreetmap.org") && r.ok());
    await page.goto("/mapa");
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await mosaico;
  });

  test("Publicar propiedad: el primer paso muestra errores bajo los campos", async ({ page }) => {
    await page.goto("/propiedad/nueva");
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await expect(page.locator("p[role=alert]").first()).toBeVisible();
  });
});
