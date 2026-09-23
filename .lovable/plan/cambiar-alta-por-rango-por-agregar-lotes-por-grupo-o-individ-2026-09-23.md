# Cambiar "Alta por rango" por "+ Agregar Lotes" (por grupo o individual)

## Objetivo
En la pantalla Lotes, reemplazar el botón "Alta por rango" por "+ Agregar Lotes" y permitir elegir entre crear varios lotes por rango (grupo) o un solo lote individual, todo en el mismo diálogo.

## Cambios (todo en `src/routes/_authenticated/lotes.tsx`)

1. **Botón**: renombrar a "+ Agregar Lotes" (icono `Plus`).

2. **Diálogo con selector de modo** (dos pestañas o radio):
   - **Por grupo**: el formulario actual — manzana, desde N°, hasta N°, área y precio opcionales. Crea los lotes correlativos como hoy.
   - **Individual**: manzana, número de lote, área y precio opcionales (mismos campos opcionales pendientes). Inserta una sola fila en `lote`.

3. **Validaciones**:
   - Individual: exigir manzana y número entero; solo manzanas residenciales (ya llegan filtradas por props).
   - Mensajes de error vía toast, como el flujo actual.

4. **Textos/metadata**: título del diálogo "Agregar lotes" con descripción que cubra ambos modos; actualizar la descripción de la página (head) a "Listado, alta e importación de lotes."

5. **Sin cambios de esquema**: mismo insert en `lote`; el trigger de manzana residencial sigue protegiendo.

## Verificación
- `bunx tsgo --noEmit` limpio y build OK.
- Revisión del diálogo: ambos modos funcionan, duplicados los rechaza la BD con mensaje claro.
