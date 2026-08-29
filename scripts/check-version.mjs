import { readFile } from "node:fs/promises";

const [packageJson, tauriConfig, cargoToml] = await Promise.all([
  readJson("package.json"),
  readJson("src-tauri/tauri.conf.json"),
  readFile("src-tauri/Cargo.toml", "utf8"),
]);

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = new Map([
  ["package.json", packageJson.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion],
]);
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

for (const [file, version] of versions) {
  if (typeof version !== "string" || !semver.test(version)) {
    fail(`${file} does not contain a valid semantic version.`);
  }
}

if (new Set(versions.values()).size !== 1) {
  fail(
    `Release versions do not match:\n${[...versions]
      .map(([file, version]) => `  ${file}: ${version}`)
      .join("\n")}`,
  );
}

console.log(`Release version ${packageJson.version} is consistent.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
