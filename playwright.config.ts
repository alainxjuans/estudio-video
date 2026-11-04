import { defineConfig, devices } from "@playwright/test";

// Dirección de tu app. Por defecto, el servidor local de "npm run dev".
// Puedes probar la web publicada con:  BASE_URL=https://roomies-cuba.lovable.app npx playwright test
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "es-CU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 5"] } },
  ],
  // Si apuntas a una web ya publicada, no hace falta levantar nada local.
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
