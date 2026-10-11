// Endpoint de Discord Interactions: comando /deobf con un archivo adjunto.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

let waitUntil;
try { ({ waitUntil } = require("@vercel/functions")); }
catch { waitUntil = (p) => p.catch(() => {}); }

const MAX_INPUT = 2 * 1024 * 1024;
const MAX_OUTPUT = 8 * 1024 * 1024; // seguro para el límite de adjuntos de Discord
const TOTAL_TIMEOUT_MS = 75_000;
const ROOT = path.resolve(__dirname, "..");
const ENGINE = path.join(ROOT, "vendor", "prometheus-recover", "bin", "recover.js");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function getRaw(req) {
  if (req.readable && !req.readableEnded) {
    try { const b = await readBody(req); if (b.length) return b; } catch (e) {}
  }
  const b = req.body;
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') return Buffer.from(b);
  if (b && typeof b === 'object') return Buffer.from(JSON.stringify(b));
  return Buffer.alloc(0);
}

function verify(raw, signature, timestamp, publicKeyHex) {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKeyHex, "hex")]),
      format: "der", type: "spki",
    });
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), raw]), key, Buffer.from(signature, "hex"));
  } catch { return false; }
}

function reply(res, content) {
  res.status(200).json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
}

function ensureLuac() {
  const src = path.join(ROOT, "vendor", "bin", "luac5.1");
  const dst = path.join(os.tmpdir(), "luac5.1");
  if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); fs.chmodSync(dst, 0o755); }
  return dst;
}

function runEngine(input, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--max-old-space-size=1500", ENGINE, input, "-o", outDir,
      "--luac", ensureLuac(), "--timeout", "30000",
    ], { cwd: path.dirname(input), stdio: "ignore", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("El archivo superó el tiempo permitido.")); }, TOTAL_TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code); });
  });
}

async function editOriginal(appId, token, content, file) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;
  const payload = { content, allowed_mentions: { parse: [] } };
  let body;
  if (file) {
    payload.attachments = [{ id: 0, filename: "resultado.lua" }];
    body = new FormData();
    body.append("payload_json", JSON.stringify(payload));
    body.append("files[0]", new Blob([file]), "resultado.lua");
  } else {
    body = JSON.stringify(payload);
  }
  await fetch(url, { method: "PATCH", body, headers: file ? {} : { "Content-Type": "application/json" } });
}

async function process_(interaction, attachment) {
  const appId = process.env.DISCORD_APP_ID || interaction.application_id;
  const token = interaction.token;
  const started = Date.now();
  let dir;
  try {
    const download = await fetch(attachment.url, { signal: AbortSignal.timeout(30_000) });
    if (!download.ok) throw new Error("No pude descargar el adjunto.");
    const data = Buffer.from(await download.arrayBuffer());
    if (data.length > MAX_INPUT) throw new Error("El archivo debe pesar como máximo 2 MiB.");

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "deobf-"));
    const input = path.join(dir, "entrada.lua");
    const out = path.join(dir, "result");
    fs.writeFileSync(input, data);

    const code = await runEngine(input, out);
    if (code !== 0 && code !== 2) throw new Error("El motor no pudo analizar este archivo Lua/Prometheus.");
    const result = path.join(out, code === 0 ? "recovered.lua" : "partial.lua");
    if (!fs.existsSync(result)) throw new Error("El motor no generó resultado.");
    const bytes = fs.readFileSync(result);
    if (bytes.length > MAX_OUTPUT) throw new Error("El resultado supera el límite de archivos de Discord.");

    const secs = ((Date.now() - started) / 1000).toFixed(2);
    await editOriginal(appId, token, `Resultado${code === 2 ? " parcial" : ""} en ${secs} s:`, bytes);
  } catch (e) {
    const msg = e && e.message && !/spawn|ENOENT|EACCES/.test(e.message)
      ? e.message : "No pude completar la operación. Revisa el archivo.";
    await editOriginal(appId, token, msg).catch(() => {});
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const raw = await readBody(req);
  const sig = req.headers["x-signature-ed25519"];
  const ts = req.headers["x-signature-timestamp"];
  if (!sig || !ts || !process.env.DISCORD_PUBLIC_KEY || !verify(raw, sig, ts, process.env.DISCORD_PUBLIC_KEY)) {
    return res.status(401).send("Invalid request signature");
  }

  const interaction = JSON.parse(raw.toString("utf8"));
  if (interaction.type === 1) return res.status(200).json({ type: 1 }); // PING

  if (interaction.type === 2 && interaction.data && interaction.data.name === "deobf") {
    const userId = (interaction.member && interaction.member.user ? interaction.member.user.id : interaction.user && interaction.user.id);
    if (userId !== process.env.DISCORD_OWNER_ID) return reply(res, "No tienes permiso para usar este comando.");

    const option = (interaction.data.options || []).find((o) => o.type === 11);
    const attachment = option && interaction.data.resolved && interaction.data.resolved.attachments
      ? interaction.data.resolved.attachments[option.value] : null;
    if (!attachment || !/\.(lua|txt)$/i.test(attachment.filename)) return reply(res, "Adjunta un único archivo `.lua` o `.txt`.");
    if (attachment.size > MAX_INPUT) return reply(res, "El archivo debe pesar como máximo 2 MiB.");

    waitUntil(process_(interaction, attachment));
    return res.status(200).json({ type: 5 }); // respuesta diferida: "Bot está pensando…"
  }
  return reply(res, "Comando no reconocido.");
};