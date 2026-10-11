// Se ejecuta durante el build en Vercel: descarga el motor fijado y compila luac 5.1.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const COMMIT = "98e1d89faeddbe8d478a9b72df58d13d43a2b765";
const root = path.resolve(__dirname, "..");
const vendor = path.join(root, "vendor");
const engine = path.join(vendor, "prometheus-recover");
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

fs.rmSync(vendor, { recursive: true, force: true });
fs.mkdirSync(path.join(vendor, "bin"), { recursive: true });
fs.mkdirSync(engine, { recursive: true });

// 1) Motor Prometheus Recover (commit fijado)
console.log("Descargando motor…");
sh(`curl -fsSL https://codeload.github.com/edwin-dev67/coderabit/tar.gz/${COMMIT} | tar xz --strip-components=1 -C "${engine}"`);

// 2) Parches de velocidad (los mismos del notebook); si no coinciden, se omiten sin romper el build
const validateFile = path.join(engine, "src", "validate.js");
if (fs.existsSync(validateFile)) {
  const text = fs.readFileSync(validateFile, "utf8");
  const oldBlock = `function validate(code, executable) {
  const candidates = executable ? [executable] : ['luac5.1', 'luac51', 'luac'];
  let compiler;
  for (const candidate of candidates) {
    const version = spawnSync(candidate, ['-v'], { encoding: 'utf8', timeout: 3000 });
    if (!version.error && version.status === 0 && /Lua 5\\.1\\b/.test(version.stdout + version.stderr)) {
      compiler = candidate;
      break;
    }
  }
  if (!compiler) return { status: 'unavailable', reason: 'Lua 5.1 compiler required; set --luac or LUAC51.' };
`;
  const newBlock = `const compilerCache = new Map();
function validate(code, executable) {
  const cacheKey = executable || '';
  let compiler = compilerCache.get(cacheKey);
  if (!compiler) {
    const candidates = executable ? [executable] : ['luac5.1', 'luac51', 'luac'];
    for (const candidate of candidates) {
      const version = spawnSync(candidate, ['-v'], { encoding: 'utf8', timeout: 3000 });
      if (!version.error && version.status === 0 && /Lua 5\\.1\\b/.test(version.stdout + version.stderr)) {
        compiler = candidate;
        break;
      }
    }
    if (compiler) compilerCache.set(cacheKey, compiler);
  }
  if (!compiler) return { status: 'unavailable', reason: 'Lua 5.1 compiler required; set --luac or LUAC51.' };
`;
  if (text.includes(oldBlock)) {
    fs.writeFileSync(validateFile, text.replace(oldBlock, newBlock));
    console.log("validate.js parcheado.");
  } else console.warn("Aviso: validate.js no coincide; parche omitido.");
}
const cli = path.join(engine, "bin", "recover.js");
if (fs.existsSync(cli)) {
  const lines = fs.readFileSync(cli, "utf8").split(/(?<=\n)/);
  fs.writeFileSync(cli, lines.filter(l =>
    !l.includes("path.join(destination, 'report.json')") &&
    !l.includes("path.join(destination, 'strings.json')")).join(""));
}

// 3) Lua 5.1: compilar luac desde el código fuente oficial
console.log("Compilando luac 5.1…");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lua-"));
sh(`curl -fsSL https://www.lua.org/ftp/lua-5.1.5.tar.gz | tar xz -C "${tmp}"`);
try {
  sh(`make posix`, { cwd: path.join(tmp, "lua-5.1.5") });
} catch (e) {
  console.error("No se pudo compilar luac (¿faltan gcc/make en el build?).");
  process.exit(1);
}
const luac = path.join(vendor, "bin", "luac5.1");
fs.copyFileSync(path.join(tmp, "lua-5.1.5", "src", "luac"), luac);
fs.chmodSync(luac, 0o755);
const v = execSync(`"${luac}" -v 2>&1`).toString();
if (!/^Lua 5\.1/.test(v)) { console.error("luac inesperado: " + v); process.exit(1); }
console.log("Listo:", v.trim());
