# Ruso A1 · Práctica

Sitio para practicar ruso nivel A1 (curso *Точка Ру A1*): vocabulario con audio, gramática (6 casos, pronombres, adjetivos, verbos), oraciones y una referencia con tablas. Los estudiantes pueden crear una cuenta y su progreso se guarda en PostgreSQL.

## Estructura

```
app.py            Servidor Flask: cuentas, progreso y API
requirements.txt  Dependencias
Procfile          Comando de arranque (gunicorn)
static/
  index.html, style.css, app.js   La web (funciona en PC y celular)
  data/           vocab.json, gram.json, sent.json, tabla.html
  audio/          irina/ y dmitri/ → w/ (palabras) y s/ (oraciones)
```

## Probarlo en tu computadora

```bash
pip install -r requirements.txt
python app.py
```

Abre http://localhost:5000. En local usa SQLite (`local.db`), no necesitas PostgreSQL.

## Publicarlo en Railway

1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elige el repositorio.
3. En el mismo proyecto: **New → Database → PostgreSQL**.
4. En el servicio web, pestaña **Variables**, añade:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referencia a la base de datos)
   - `SECRET_KEY` = una cadena larga y aleatoria (por ejemplo, la salida de `python -c "import secrets; print(secrets.token_hex(32))"`)
5. En **Settings → Networking**, pulsa **Generate Domain** (o conecta tu dominio propio).

Las tablas de la base de datos se crean solas al arrancar.

## API

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/register` | Crear cuenta `{username, name, password}` |
| POST | `/api/login` | Entrar `{username, password}` |
| POST | `/api/logout` | Salir |
| GET | `/api/me` | Usuario actual |
| POST | `/api/password` | Cambiar contraseña `{old, new}` |
| POST | `/api/session` | Guardar resultados `{kind, mode, results:[{key, section, ok}]}` |
| GET | `/api/stats` | Progreso del usuario |
| POST | `/api/reset` | Borrar el progreso del usuario |
| GET | `/api/leaderboard` | Ranking de la semana (nombre y puntos) |

## Añadir contenido

El contenido está en `static/data/*.json`. Cada palabra tiene un `id` y su audio en `static/audio/<voz>/w/<id>.mp3`. Para nuevas unidades, añade las secciones al JSON y genera su audio con el mismo `id`.

## Notas

- Las contraseñas se guardan cifradas (scrypt de Werkzeug); nunca en texto plano.
- El login tiene un límite simple de intentos por IP.
- El ranking muestra el nombre que cada estudiante eligió al registrarse.
"# rusia" 
