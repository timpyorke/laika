import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

function fail(message) {
  throw new Error(`Security configuration check failed: ${message}`);
}

function quotedValues(block) {
  return [...block.matchAll(/"([a-z][a-z0-9_-]+)"/g)].map((match) => match[1]);
}

function commandBlock(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) fail(`could not read ${label} command list`);
  return new Set(quotedValues(match[1]));
}

function assertSameSet(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value));
  const extra = [...actual].filter((value) => !expected.has(value));
  if (missing.length || extra.length) {
    fail(`${label} differs (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`);
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  }));
  return files.flat();
}

const [configSource, capabilitySource, permissionSource, buildSource, rustLib, packageSource, cargoSource] = await Promise.all([
  read("src-tauri/tauri.conf.json"),
  read("src-tauri/capabilities/default.json"),
  read("src-tauri/permissions/main-window.toml"),
  read("src-tauri/build.rs"),
  read("src-tauri/src/lib.rs"),
  read("package.json"),
  read("src-tauri/Cargo.toml"),
]);

const config = JSON.parse(configSource);
const capability = JSON.parse(capabilitySource);
const security = config.app?.security;
if (!security?.csp || typeof security.csp !== "object") fail("production CSP is disabled");
if (security.devCsp !== null) fail("development CSP policy must remain explicit");
if (security.freezePrototype !== true) fail("prototype freezing is disabled");
if (JSON.stringify(security.capabilities) !== JSON.stringify(["default"])) fail("capability selection is not explicit");

const requiredDirectives = {
  "default-src": "'self' customprotocol: asset:",
  "connect-src": "ipc: http://ipc.localhost",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
};
for (const [directive, value] of Object.entries(requiredDirectives)) {
  if (security.csp[directive] !== value) fail(`CSP directive ${directive} is missing or broadened`);
}
if (Object.values(security.csp).some((value) => String(value).includes("'unsafe-eval'") || String(value).includes("*"))) {
  fail("CSP contains unsafe-eval or a wildcard source");
}

if (capability.identifier !== "default" || JSON.stringify(capability.windows) !== JSON.stringify(["main"])) {
  fail("main-window capability scope changed");
}
if (JSON.stringify(capability.permissions) !== JSON.stringify(["main-window-commands"])) {
  fail("main window has permissions beyond the custom command allowlist");
}

const buildCommands = commandBlock(buildSource, /const COMMANDS[^=]*=\s*&\[([\s\S]*?)\];/, "build manifest");
const permissionCommands = commandBlock(permissionSource, /commands\.allow\s*=\s*\[([\s\S]*?)\]/, "permission");
const registeredBlock = rustLib.match(/generate_handler!\[([\s\S]*?)\]\)/)?.[1];
if (!registeredBlock) fail("could not read registered Tauri commands");
const registeredCommands = new Set([...registeredBlock.matchAll(/(?:commands|backup)::([a-z][a-z0-9_]+)/g)].map((match) => match[1]));
assertSameSet(permissionCommands, registeredCommands, "permission allowlist");
assertSameSet(buildCommands, registeredCommands, "build manifest");

const frontendCommands = new Set();
for (const file of await sourceFiles(path.join(root, "src"))) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\binvoke(?:<[\s\S]*?>)?\(\s*"([a-z][a-z0-9_]+)"/g)) frontendCommands.add(match[1]);
}
const deniedFrontendCommands = [...frontendCommands].filter((command) => !permissionCommands.has(command));
if (deniedFrontendCommands.length) fail(`frontend calls commands outside the allowlist: ${deniedFrontendCommands.join(", ")}`);

for (const [label, source] of [["package.json", packageSource], ["Cargo.toml", cargoSource], ["Tauri builder", rustLib]]) {
  if (source.includes("plugin-opener") || source.includes("plugin_opener")) fail(`${label} still enables the unused opener plugin`);
}

console.log(`Security configuration verified: ${registeredCommands.size} least-privilege commands and a production CSP.`);
