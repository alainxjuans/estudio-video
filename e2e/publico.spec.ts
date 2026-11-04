import { test, expect } from "@playwright/test";

// Pruebas sin iniciar sesión: no necesitan cuenta.

test("la landing muestra el titular y el botón de registro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Encuentra con quién y dónde vivir en Cuba/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Crear cuenta gratis/ })).toBeVisible();
});

for (const ruta of ["/", "/login", "/register"]) {
  test(`sin desbordamiento horizontal en ${ruta}`, async ({ page }) => {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(desborda, "la página se ensancha más que la pantalla").toBe(false);
  });
}

test("login con datos incorrectos muestra un error en español", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#id").fill("no-existe-roomies@example.com");
  await page.locator("#pw").fill("ClaveIncorrecta1");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  // Acepta tanto "datos incorrectos" como "sin conexión" (si la prueba corre sin internet)
  await expect(page.getByText(/Correo o contraseña incorrectos|No pudimos conectar/)).toBeVisible();
  await expect(page.getByText(/Invalid login credentials|Failed to fetch/)).toHaveCount(0);
});

test("el correo del login no se pone en mayúscula ni se autocorrige", async ({ page }) => {
  await page.goto("/login");
  const campo = page.locator("#id");
  await expect(campo).toHaveAttribute("autocapitalize", "none");
  await expect(campo).toHaveAttribute("autocorrect", "off");
});
