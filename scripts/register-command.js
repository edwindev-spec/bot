// Uso: DISCORD_TOKEN=... DISCORD_APP_ID=... node scripts/register-command.js
// Opcional: DISCORD_GUILD_ID=... para registrarlo al instante solo en tu servidor.
const { DISCORD_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_APP_ID) { console.error("Faltan DISCORD_TOKEN o DISCORD_APP_ID"); process.exit(1); }
const url = `https://discord.com/api/v10/applications/${DISCORD_APP_ID}` +
  (DISCORD_GUILD_ID ? `/guilds/${DISCORD_GUILD_ID}` : "") + "/commands";
fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify([{
    name: "deobf", type: 1, description: "Recupera un script Lua ofuscado con Prometheus",
    options: [{ type: 11, name: "archivo", description: "Archivo .lua o .txt (máx. 2 MiB)", required: true }],
  }]),
}).then(async (r) => console.log(r.status, await r.text()));
