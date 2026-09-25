/**
 * Install the locally built Deep Code CLI over an existing global install.
 *
 * The published package flattens `packages/cli/dist/*` into the package root
 * (`cli.js`, `chunks/`, `templates/`, `bundled/`). This script rebuilds nothing
 * itself; run `npm run build` first (or use `npm run install:local`).
 *
 * Target resolution order:
 *   1. `DEEPCODE_INSTALL_DIR` environment variable
 *   2. the directory containing the `deepcode` executable found on PATH
 *   3. `~/.local/lib/node_modules/@vegamo/deepcode-cli`
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "packages", "cli", "dist");

const BUNDLE_ENTRIES = ["cli.js", "chunks", "templates", "bundled"];
const PACKAGE_NAME = "@vegamo/deepcode-cli";

function fail(message) {
  console.error(`\n❌  ${message}`);
  process.exit(1);
}

function expandHome(value) {
  return value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function findOnPath(command) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = join(dir, command);
    try {
      const stats = statSync(candidate);
      if (stats.isFile() || stats.isSymbolicLink()) {
        return candidate;
      }
    } catch {
      // keep looking
    }
  }
  return null;
}

function resolveInstallDir() {
  if (process.env.DEEPCODE_INSTALL_DIR) {
    return resolve(expandHome(process.env.DEEPCODE_INSTALL_DIR));
  }

  const executable = findOnPath("deepcode");
  if (executable) {
    return dirname(realpathSync(executable));
  }

  return join(homedir(), ".local", "lib", "node_modules", "@vegamo", "deepcode-cli");
}

function assertTarget(target) {
  const manifest = join(target, "package.json");
  if (!existsSync(join(target, "cli.js")) || !existsSync(manifest)) {
    fail(
      `"${target}" does not look like a Deep Code install (missing cli.js/package.json).\n` +
        `    Set DEEPCODE_INSTALL_DIR to the package directory and retry.`
    );
  }
  const { name } = JSON.parse(readFileSync(manifest, "utf8"));
  if (name !== PACKAGE_NAME) {
    fail(`"${target}" is package "${name}", expected "${PACKAGE_NAME}".`);
  }
}

function backup(target) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(target, ".backups", stamp);
  mkdirSync(backupDir, { recursive: true });
  for (const entry of BUNDLE_ENTRIES) {
    const source = join(target, entry);
    if (existsSync(source)) {
      cpSync(source, join(backupDir, entry), { recursive: true, dereference: true });
    }
  }
  return backupDir;
}

function syncEntry(target, entry) {
  const source = join(distDir, entry);
  if (!existsSync(source)) {
    fail(`Built artifact "${entry}" is missing from ${distDir}. Run \`npm run build\` first.`);
  }
  const dest = join(target, entry);
  rmSync(dest, { recursive: true, force: true });
  cpSync(source, dest, { recursive: true, dereference: true });
}

function main() {
  if (!existsSync(join(distDir, "cli.js"))) {
    fail(`No build found at ${distDir}. Run \`npm run build\` first.`);
  }

  const target = resolveInstallDir();
  assertTarget(target);

  const backupDir = backup(target);
  for (const entry of BUNDLE_ENTRIES) {
    syncEntry(target, entry);
  }
  chmodSync(join(target, "cli.js"), 0o755);

  console.log(`\n✅  Installed local Deep Code build into ${target}`);
  console.log(`    Previous build backed up to ${backupDir}`);
  console.log(`    Run \`deepcode --version\` to confirm.\n`);
}

main();
