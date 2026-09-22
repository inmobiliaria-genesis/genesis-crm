# Property Hub

El esquema de base de datos ya existe en el Supabase conectado a este proyecto: tablas perfil, bitacora, proyecto, etapa, manzana, lote, config, con RLS, triggers de auditoría/bitácora, bloqueo de borrado, y la función importar_lotes ya creados. No modifiques el esquema ni crees tablas nuevas.

Genera la interfaz completa sobre este esquema existente:

1. Login con correo y contraseña. El primer usuario que se registra queda como admin.

2. Pantalla Usuarios (solo admin): crear, desactivar, cambiar rol.

3. Pantalla Bitácora (admin y socio): filtros por usuario, tabla y fecha.

4. Estructura: gestión de proyecto, etapas y manzanas.

5. Lotes: alta rápida por rango, edición individual, listado con filtros, indicador de "Datos pendientes", filtro "Solo pendientes de completar", importación desde Excel (usa la función importar_lotes ya existente).

6. Pantalla de Configuración (solo admin), mostrando el historial de cada valor.

7. Menú lateral: Lotes, Ventas, Cobranza, Comisiones, Personal y planilla, Gastos, Reportes, Configuración, Usuarios, Bitácora. Los módulos aún no construidos aparecen deshabilitados.

Montos en soles (S/ 1,234.50), fechas dd/mm/aaaa, zona horaria America/Lima.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cd5ab1d6-3e79-495b-8289-47084fd1c65a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
