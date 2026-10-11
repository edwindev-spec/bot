const fs = require("fs");
const path = require("path");
module.exports = (req, res) => {
  const root = path.resolve(__dirname, "..");
  const engine = fs.existsSync(path.join(root, "vendor", "prometheus-recover", "bin", "recover.js"));
  const luac = fs.existsSync(path.join(root, "vendor", "bin", "luac5.1"));
  const env = !!(process.env.DISCORD_PUBLIC_KEY && process.env.DISCORD_OWNER_ID);
  res.setHeader("Cache-Control", "no-store");
  res.status(engine && luac && env ? 200 : 503).json({ online: engine && luac && env, engine, luac, env });
};
