# Respaldo de archivos en Google Drive

## Lo primero: qué NO cubre

**Esto respalda los ARCHIVOS** (fotos de visitas, firmas, actas, RUT, contratos, pólizas, audios de reuniones…: todo lo que está en Storage).

**NO respalda la BASE DE DATOS** (clientes, cotizaciones, proyectos, tareas, nómina, el registro de qué se firmó y cuándo…). Mientras Supabase esté en plan gratuito, **las tablas no tienen respaldo**. Si la base se pierde, los archivos en Drive quedan sin el contexto que los ordena.

Son dos problemas distintos. Este resuelve el primero. El segundo sigue abierto.

## Qué hace

- La función `respaldar-drive` (Supabase Edge Function) corre sola con un cron. No depende del PC de la oficina ni de n8n.
- Copia cada archivo de Storage a la carpeta **Respaldo ERP Servielectro** del Drive de `servielectrobogota@gmail.com`, con la misma estructura de carpetas: `bucket/carpeta/archivo`. Ocupa los 5 TB de Google One.
- Por cada archivo anota en la base (`respaldo_drive_archivos`) el id de la copia en Drive, el MD5 y **la fecha en que se verificó**.
- **Verificado** quiere decir que Drive confirmó el mismo MD5 y el mismo tamaño que los bytes que se bajaron de Storage. Antes de eso, el archivo no cuenta como respaldado.
- Cada 7 días vuelve a preguntarle a Drive por las copias. Si una ya no está, o está en la papelera, queda **perdida** y se vuelve a subir.
- Se puede retomar: arranca con todo el histórico y sigue donde quedó en cada vuelta. Hace hasta 200 MB y unos 110 segundos por vuelta. Nunca sube dos veces lo mismo, ni siquiera si una vuelta se cortó a la mitad.
- Si un archivo se borra de Storage, **su copia en Drive se queda**.
- **El audio de las reuniones:** la regla es que el ERP no descarta una grabación porque se cumplió el plazo, sino solo si tiene prueba de que la copia existe. Esa prueba la escribe esta función en la reunión (columnas de la migración 89). Mientras no haya copia verificada, la base no deja descartar el audio.

## Si se cae, avisa

- **La autorización de Google se vence o se revoca:** la vuelta termina como `autorizacion_vencida` y le llega un aviso **urgente** al responsable de Configuración (también al celular, si tiene activados los avisos). Hay que volver a correr el autorizador.
- **Una vuelta termina con errores:** también avisa.
- **El estado** se ve en la vista `v_respaldo_drive_resumen`: cuántos archivos están respaldados, pendientes, con error o perdidos, la última vuelta buena y la verificación más vieja. Si la última vuelta buena se aleja más de un día, **el respaldo no está corriendo**. Un cron apagado no avisa solo.

## Puesta en marcha (una vez)

### 1. Google Cloud (con servielectrobogota@gmail.com)

En https://console.cloud.google.com:

1. **API y servicios → Biblioteca:** habilitar **Google Drive API**.
2. **Pantalla de consentimiento de OAuth:** tipo **Externo**. Permisos (scopes): **solo** `.../auth/drive.file`, nada más.
3. **Publicar la app** ("Publicar app", que la pasa a **En producción**). Es obligatorio. Una app en "Prueba" recibe permisos que **se vencen a los 7 días**: el respaldo se caería solo a la semana. Como `drive.file` no es un permiso sensible, publicar no exige que Google verifique la app.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → App de escritorio.** Descargar el JSON y guardarlo como `C:\Proyectos\.secretos\google-oauth-cliente.json`.

**No se usa cuenta de servicio:** en un Gmail personal no tiene cuota de Drive propia y las subidas fallan.

### 2. Autorizar (en el PC de la oficina)

"Corre el autorizador de Drive":

```
npm run autorizar-drive
```

- Abre el navegador. Hay que entrar con **servielectrobogota@gmail.com**. Si se entra con la otra cuenta (la del n8n), el script lo detecta, revoca ese permiso y no guarda nada.
- Crea (o reutiliza) la carpeta **Respaldo ERP Servielectro**.
- Escribe `C:\Proyectos\.secretos\drive.env`, fuera del repositorio. **Ese archivo no se commitea ni se manda por chat.**

### 3. Supabase

```
npx supabase secrets set --env-file "C:\Proyectos\.secretos\drive.env" --project-ref <ref>
npx supabase functions deploy respaldar-drive --project-ref <ref>
```

Antes, correr la migración 91 (y la 89).

**El cron:** en Supabase, **Integrations → Cron → Create job**. Se arma igual que el de `enviar-push`, llamando a la Edge Function `respaldar-drive` con la clave de servicio, **cada 10 minutos**. La primera vez puede tardar varias horas en ponerse al día con el histórico; después, cada vuelta solo sube lo nuevo.

**Probar:** después de la primera vuelta, revisar `v_respaldo_drive_resumen` y la carpeta en Drive.

## Si llega el aviso de autorización vencida

1. Revisar en Google Cloud que la app siga **En producción**.
2. Correr de nuevo `npm run autorizar-drive`. Pregunta antes de reemplazar `drive.env`.
3. Volver a cargar los secretos: `npx supabase secrets set --env-file …`. La siguiente vuelta sigue donde quedó.

Google revoca el permiso si alguien lo quita en https://myaccount.google.com/permissions, o si la app pasa 6 meses sin usarse (con el cron, no pasa).

## Qué no hacer en Drive

- **Mover o renombrar** la carpeta o los archivos se puede: el respaldo los sigue por id.
- **Borrar o mandar a la papelera** un archivo del respaldo: la próxima reverificación lo marca como perdido y lo vuelve a subir, si todavía está en Storage. Si ya no está, esa copia era la única.
