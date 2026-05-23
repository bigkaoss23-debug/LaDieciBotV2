// VERSION-01-FE — genera public/version.json a build time.
// Whitelist esplicita dei campi. MAI process.env completo, MAI segreti,
// MAI hostname/username/path locali. Su Netlify legge COMMIT_REF / BRANCH /
// CONTEXT / DEPLOY_ID / DEPLOY_URL / URL. In locale fallback su `git
// rev-parse`. Se tutto fallisce → "unknown".

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function safeGit(args, fallback = "unknown") {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || fallback;
  } catch (_) {
    return fallback;
  }
}

const commitFull = process.env.COMMIT_REF || safeGit("rev-parse HEAD");
const branch = process.env.BRANCH || safeGit("rev-parse --abbrev-ref HEAD");
const commit = commitFull === "unknown" ? "unknown" : commitFull.slice(0, 7);

const payload = {
  ok: true,
  app: "ladieci-frontend",
  source: "build-time",
  commit,
  commitFull,
  branch,
  context: process.env.CONTEXT || "local",
  deployId: process.env.DEPLOY_ID || "unknown",
  deployUrl: process.env.DEPLOY_URL || "unknown",
  siteUrl: process.env.URL || "unknown",
  buildTime: new Date().toISOString(),
};

const outDir = path.join(__dirname, "..", "public");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "version.json");
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");

console.log(`[write-version] ${payload.commit} ${payload.context} → public/version.json`);
