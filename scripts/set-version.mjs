import { readFile, writeFile } from "node:fs/promises";

const nextVersion = process.argv[2];
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!nextVersion || !semver.test(nextVersion)) {
  console.error("Usage: pnpm version:set <major.minor.patch[-prerelease]>");
  process.exit(1);
}

const packagePath = "package.json";
const tauriPath = "src-tauri/tauri.conf.json";
const cargoPath = "src-tauri/Cargo.toml";
const [packageJson, tauriConfig, cargoToml] = await Promise.all([
  readJson(packagePath),
  readJson(tauriPath),
  readFile(cargoPath, "utf8"),
]);

packageJson.version = nextVersion;
tauriConfig.version = nextVersion;
const nextCargoToml = cargoToml.replace(
  /^version\s*=\s*"[^"]+"/m,
  `version = "${nextVersion}"`,
);

await Promise.all([
  writeJson(packagePath, packageJson),
  writeJson(tauriPath, tauriConfig),
  writeFile(cargoPath, nextCargoToml, "utf8"),
]);

console.log(`Set the Laika release version to ${nextVersion}.`);
console.log("Run cargo check --manifest-path src-tauri/Cargo.toml to refresh Cargo.lock.");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
