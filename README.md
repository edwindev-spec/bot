# Bot de Discord en Vercel (slash command `/deobf`)

Vercel no admite bots con conexión permanente, así que el bot funciona con **Interactions**:
Discord llama a tu función de Vercel cada vez que alguien usa `/deobf`. Está "disponible 24/7" sin proceso corriendo.

## Pasos
1. Sube esta carpeta a GitHub e impórtala en Vercel (framework: Other).
2. Variables de entorno en Vercel:
- `DISCORD_PUBLIC_KEY` (Developer Portal → General Information → Public Key)
- `DISCORD_APP_ID` (Application ID)
- `DISCORD_OWNER_ID` (tu ID de Discord)
3. Despliega. Abre `https://TU-PROYECTO.vercel.app/api/health`: debe devolver `online: true`.
4. Developer Portal → General Information → **Interactions Endpoint URL** = `https://TU-PROYECTO.vercel.app/api/interactions` → Save.
5. Registra el comando una vez desde tu PC (con un token regenerado):
`DISCORD_TOKEN=... DISCORD_APP_ID=... DISCORD_GUILD_ID=... node scripts/register-command.js`
6. Invita el bot con el scope `applications.commands` y usa `/deobf archivo:<tu.lua>`.

## Límites
- Máx. 2 MiB de entrada y 75 s por trabajo (la función admite hasta 300 s).
- Sin caché entre ejecuciones (Vercel no guarda estado).
- Si el build falla en "Compilando luac", el entorno de build no tiene gcc/make: avísame con el log.