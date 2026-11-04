# Pruebas de Roomies

## 1. Pruebas automáticas (Playwright)

Se ejecutan en **tu computadora**, no dentro de Lovable.

```bash
npm i -D @playwright/test        # una sola vez
npx playwright install chromium  # una sola vez (descarga el navegador)

# Pruebas sin cuenta (landing, login, desbordamientos):
npx playwright test publico

# Todas, con una cuenta de PRUEBA (nunca la de un usuario real):
TEST_EMAIL=prueba@ejemplo.com TEST_PASSWORD='tu-clave' npx playwright test

# Contra la web ya publicada en lugar del servidor local:
BASE_URL=https://roomies-cuba.lovable.app npx playwright test publico

# Ver el informe si algo falla:
npx playwright show-report
```

Notas:
- Si tu servidor local no usa el puerto 8080, cambia `BASE_URL` (o el valor por defecto en `playwright.config.ts`).
- `TEST_PLAN_AVANZADO=1` activa las pruebas del mapa y del formulario de publicar; la cuenta debe tener un plan que lo permita.
- Ninguna prueba envía un pago ni publica una propiedad.
- Estas pruebas se escribieron sin poder ejecutarlas. Si una falla porque no encuentra un botón o un texto, casi seguro es el selector, no la app: revisa la captura que guarda Playwright.

## 2. Pruebas manuales en el celular

Marca cada punto después de probarlo en un teléfono real.

**Entrar y registrarse**
- [ ] Iniciar sesión escribiendo el correo con mayúscula inicial.
- [ ] Con contraseña incorrecta, el mensaje sale en español.
- [ ] Crear una cuenta de prueba: ¿a dónde te lleva al terminar?
- [ ] Nueva contraseña: el ojito y el campo de repetir funcionan.

**Descubrir, favoritos y detalle**
- [ ] Descubrir muestra tarjetas de carga y luego los resultados.
- [ ] Con modo avión, sale el aviso con "Reintentar".
- [ ] En el detalle de una propiedad, la barra de contacto (precio + botón) no queda tapada por la barra de abajo.
- [ ] "Ver las N fotos" abre el visor y se puede deslizar.

**Mapa**
- [ ] Se ve el mapa con calles (sin marca de "API KEY").
- [ ] "Usar mi ubicación" o tocar el mapa pone el punto de partida.
- [ ] Al elegir una propiedad: aparece la ruta punteada, la distancia y el tiempo; cambiar entre "A pie" y "En auto" funciona.

**Publicar propiedad**
- [ ] Publicar con 2 o 3 fotos: se suben y la propiedad queda bien.
- [ ] Recargar a mitad del formulario: aparece "Recuperamos tu borrador".
- [ ] Los botones Atrás/Siguiente no quedan tapados por la barra de abajo.
- [ ] El botón de quitar foto se ve sin pasar el cursor.

**Chat y perfil**
- [ ] El botón de la carita abre y cierra las respuestas rápidas.
- [ ] Cambiar la foto de perfil con una foto grande: sube rápido.

**Planes (sin pagar)**
- [ ] La ventana de pago muestra "Copiar" junto al número de cuenta.

**Administrador (con un pago o solicitud de prueba)**
- [ ] Aprobar/rechazar un pago pide confirmación.
- [ ] Asignar contraseña provisional: la contraseña se ve con botón Copiar antes de cerrar.
- [ ] Guardar un cambio de precio pequeño: sale el resumen "antes → después".
- [ ] Marcar un retiro de referidos como pagado pide confirmación.

**Modo oscuro**
- [ ] Revisa Inicio, Mapa, Chat y Planes: ningún texto gris queda ilegible.
