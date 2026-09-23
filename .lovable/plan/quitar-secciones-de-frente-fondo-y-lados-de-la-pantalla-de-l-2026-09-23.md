# Quitar secciones de frente, fondo y lados de la pantalla de Lotes

## Objetivo
Eliminar del módulo **Lotes** todos los campos y columnas relacionados con `frente`, `fondo`, `lado derecho` e `izquierdo`, manteniendo el esquema de base de datos intacto.

## Cambios en `src/routes/_authenticated/lotes.tsx`

1. **Formulario de edcción individual**
   - Reducir la constante `CAMPOS_NUMERICOS` a solo `area_m2` y `precio_lista`.
   - El componente `EditarLote` seguirá generando los inputs automáticamente a partir de esa lista, por lo que dejará de mostrar los cuatro campos.

2. **Tabla de lotes**
   - Quitar las cuatro columnas de encabezado: Frente, Fondo, Lado der., Lado izq.
   - Quitar las cuatro celdas correspondientes en cada fila.
   - Ajustar `colSpan` de las filas de carga y vacío de `10` a `6` (número final de columnas).

3. **Importación desde Excel**
   - Quitar `frente_m`, `fondo_m`, `lado_derecho_m`, `lado_izquierdo_m` de `COLUMNAS_PLANTILLA`.
   - Quitar esos cuatro campos del objeto `payload` que se envía a `importar_lotes`.
   - Actualizar el texto descriptivo del diálogo de importación para que solo liste: `etapa`, `manzana`, `numero`, `area_m2`, `precio_lista`, `notas`.

4. **Indicador "Datos pendientes"**
   - La función `estaPendiente` ya depende de `CAMPOS_NUMERICOS`, por lo que seguirá funcionando con solo área y precio.

## Alcance explícito
- No se modifica el esquema de base de datos ni se eliminan columnas de la tabla `lote`.
- No se tocan otras pantallas (Estructura, Configuración, etc.).

## Verificación
- Typecheck limpio (`bunx tsgo --noEmit`).
- Build sin errores.
- Revisión visual: la tabla de lotes y el formulario de edición ya no muestran frente, fondo ni lados, y la plantilla de Excel descargable contiene solo las columnas indicadas.
