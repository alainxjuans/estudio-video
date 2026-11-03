# Estudio · Video publicitario (app instalable)

Carpeta lista para publicar en GitHub Pages y usar como app en Windows 10.

## 1. Publicar en GitHub (sin instalar nada)
1. Entra a github.com con tu cuenta y pulsa **New repository**.
2. Nombre: `estudio-video`. Márcalo como **Public** y pulsa **Create repository**.
3. En el repositorio nuevo pulsa **uploading an existing file**.
4. Descomprime este zip y arrastra TODO su contenido (los archivos y la carpeta `vendor`) a la ventana. Si ya subiste la versión anterior, solo hace falta subir `index.html` y `sw.js`, y la carpeta `vendor` nueva (voz). Importante: `index.html` debe quedar en la raíz del repositorio, no dentro de otra carpeta.
5. Abajo pulsa **Commit changes**.
6. Ve a **Settings → Pages**. En *Build and deployment* elige **Deploy from a branch**, rama **main**, carpeta **/ (root)** y pulsa **Save**.
7. Espera 1 o 2 minutos. Tu enlace será `https://TU-USUARIO.github.io/estudio-video/`.

## 2. Instalar en Windows 10
1. Abre ese enlace en **Edge** o **Chrome** actualizado.
2. Pulsa **Instalar app** (arriba a la derecha de la app) o el icono de instalar en la barra de direcciones.
3. Se crea un icono en el escritorio y en el menú Inicio. Funciona también sin internet.

## 3. Exportar MP4
- Pulsa **Exportar MP4**. Si algo falla, el mensaje aparece debajo de la línea de tiempo.
- Si no sale nada, abre las herramientas de desarrollo con **F12 → Consola** y copia el error que aparezca.

## 4. IA (opcional)
Pestaña **Plantillas → Ajustes de IA**: pega una clave de API de Anthropic. Sin clave todo funciona, menos el guion con IA y el análisis de cuadros de videos. La IA se cobra por uso.

## 5. Voz con IA gratis (Piper)
Pestaña **Audio → Voz con IA**: elige una voz y pulsa **Generar voz de las escenas**. La primera vez descarga la voz (50 a 110 MB) y la guarda en tu navegador. Las escenas se alargan si la voz dura más. En **Exportar MP4** deja marcado «Incluir voz IA».
Si falla, abre **F12 → Consola** y copia el error.

## 6. Trabajar con Claude
Pestaña **Claude**: pulsa **Copiar contexto y prompt para Claude**, pégalo en el chat y escribe debajo los cambios. Claude responde con un bloque JSON: pégalo en la app y pulsa **Aplicar respuesta**.

## 7. Capas: edición manual
Pestaña **Capas**: añade texto, formas, imágenes y videos a la escena que está en pantalla. Toca un bloque de la línea de tiempo para elegir la escena, toca un elemento sobre el video para seleccionarlo y arrástralo. Cada capa tiene tamaño, color, rotación, opacidad, cuándo aparece y cuánto dura, animación de entrada y de salida, y orden (↑ ↓). Los videos que añadas se recortan con «Inicio dentro del video». El audio original de esos videos no se incluye.

## 8. Avatar con tu foto
En la pestaña **Capas**, sección **Avatar desde tu foto**: sube una foto de frente, quita el fondo liso con el control de tolerancia y pulsa **Guardar y añadir a la escena**. Ajusta «Línea de la boca» hasta que coincida con tu boca. Con la voz generada (Audio → Voz con IA) el avatar mueve la boca al ritmo de la voz; sin voz hace un movimiento suave. Usa solo fotos tuyas o con permiso de la persona.

## 9. Transiciones y fondo por escena
En la pestaña **Escenas**, cada escena tiene un selector de transición (barrido, fundido, zoom, deslizar o corte) y un color de fondo propio. El botón «✕ fondo» vuelve al fondo de la plantilla.

## 10. Pistas de audio extra
Pestaña **Audio → Pistas de audio extra**: sube efectos o más música, elige en qué segundo empieza cada uno, su volumen y si se repite. Se oyen en la vista previa y se mezclan en el MP4 junto con la voz y la música, si dejas marcado «Incluir música» al exportar.

## 11. Proyectos y autoguardado
En la pestaña **Brief**, sección **Proyecto**: **Guardar proyecto** descarga un archivo `.json` con tus escenas, capas, colores e imágenes y avatares. **Abrir proyecto** lo recupera. Los videos no se guardan dentro del archivo: hay que volver a añadirlos (la capa queda marcada con «falta»). La app también se autoguarda cada 5 segundos mientras editas; si cierras sin querer, pulsa **Recuperar autoguardado** (las imágenes, avatares y videos hay que volver a añadirlos).

## 12. Atajos del teclado (laptop)
- **Espacio**: reproducir o pausar.
- **Ctrl+Z**: deshacer cambios en las capas.
- **Flechas**: mueven la capa seleccionada (con Shift, de 5 en 5).
- **Supr**: borra la capa seleccionada. **Ctrl+D**: la duplica.
- En **Escenas**, el botón ⧉ duplica una escena completa.

## 13. Audio de los videos
Al añadir un video como capa, su sonido se oye en la vista previa y se mezcla en el MP4. Ajusta «Volumen del video %» (0 lo silencia). Con videos muy pesados, la mezcla puede tardar al exportar.

## 14. Director: el chat con Claude (pantalla de inicio)
Al abrir la app aparece primero el chat con Claude. Escríbele tu idea y usa el clip 📎 para adjuntar:
- **Un video de referencia:** Claude mira unos cuadros y las medidas del video (colores y ritmo), describe su estilo, lo guarda como plantilla con nombre y arma las escenas.
- **Fotos:** las puede colocar en las escenas.
- **El zip de un proyecto tuyo:** lee el código (ignora `node_modules` y archivos pesados), te resume qué hace y te propone qué tipo de video hacer.
- **Textos o archivos de código sueltos.**

Claude arma el video solo (escenas, textos, transiciones, capas) y puede generar la voz. Tú lo ajustas en las demás pestañas y exportas con **Exportar MP4**.

**Importante:** para chatear dentro de la app hace falta una clave de API de Anthropic (se pega en la misma pestaña, sección «Clave de API») y se cobra por uso; los adjuntos grandes, como un zip de código o muchas imágenes, cuestan más. **Modo gratis:** debajo hay un bloque «copiar y pegar con claude.ai» para trabajar en el chat de Claude sin clave.

## 15. Plantillas con nombre
Al crear una plantilla desde videos de muestra puedes escribirle un **nombre** antes de pulsar el botón. En **Plantillas → Tus plantillas** puedes **usar**, **renombrar** o **eliminar** cada una. Si se la pides al Director, él les pone el nombre.

## 16. Subtítulos sincronizados con la voz
Si generaste la voz de una escena, el subtítulo de abajo aparece palabra por palabra al ritmo de la locución (según la longitud de cada palabra). Sin voz, se reparte por igual en la duración de la escena.

## 17. Tipografías, contorno y sombra
En **Brief → Tipografía del video** eliges la fuente de todo el video. En **Capas**, cada texto tiene su propia fuente, contorno (grosor y color) y sombra. Las fuentes son las instaladas en tu Windows (Arial Black, Impact, Georgia, Trebuchet MS, Verdana, Courier New).

## 18. Formatos de exportación
En **Exportar MP4** eliges el formato: **9:16** vertical (Reels, TikTok, Estados), **1:1** cuadrado (Feed) o **16:9** horizontal (YouTube, Facebook). En 1:1 y 16:9 el video vertical va al centro con un fondo difuminado a los lados. La resolución (Alta, Rápida, Borrador) es la altura o el ancho base del formato.

## 19. Deshacer
**Ctrl+Z** ahora deshace también los cambios en la lista de escenas (añadir, borrar, duplicar, mover, editar textos, aplicar plantillas o respuestas de Claude), hasta 40 pasos.

## 20. Actualizar la app
Sube el `index.html` nuevo al repositorio (Add file → Upload files). Cambia el número de versión en `sw.js` (por ejemplo `estudio-v2` a `estudio-v3`) para que los usuarios reciban la actualización.
