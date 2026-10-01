import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { createRequire, isBuiltin } from "node:module";
const name = process.argv[2];
if (!["jenkins-stage-progress", "snyk-security"].includes(name))
  throw Error("Unknown plugin");
const root = process.cwd(),
  dir = path.join(root, "plugins", name, "backend"),
  out = path.join(dir, "dist-dynamic");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(dir, "package.json"))
);
const resolve = createRequire(path.join(dir, "package.json"));
assertDependency("express", sourceManifest.dependencies.express);
assertDependency(
  "@backstage/backend-plugin-api",
  sourceManifest.peerDependencies["@backstage/backend-plugin-api"]
);
function assertDependency(name, expected) {
  const installed = resolve(name + "/package.json").version;
  if (installed !== expected) throw Error(`Build dependency mismatch: ${name}`);
}
const result = await build({
  entryPoints: [path.join(dir, "index.cjs")],
  outfile: path.join(out, "index.cjs"),
  platform: "node",
  format: "cjs",
  target: "node22",
  bundle: true,
  external: ["@backstage/backend-plugin-api"],
  metafile: true,
  legalComments: "eof",
});
for (const output of Object.values(result.metafile.outputs))
  for (const i of output.imports)
    if (
      i.external &&
      i.path !== "@backstage/backend-plugin-api" &&
      !isBuiltin(i.path)
    )
      throw Error(`Unexpected runtime dependency: ${i.path}`);
const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json")));
pkg.name += "-dynamic";
delete pkg.dependencies;
delete pkg.files;
pkg.main = "index.cjs";
fs.writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n"
);
fs.copyFileSync(
  path.join(dir, "config-schema.json"),
  path.join(out, "config-schema.json")
);
fs.copyFileSync(path.join(root, "LICENSE"), path.join(out, "LICENSE"));
// Preserve licenses for all bundled private dependencies, including Express.
const licenses = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  let parent = path.dirname(path.resolve(input));
  while (parent !== path.dirname(parent)) {
    if (fs.existsSync(path.join(parent, "package.json"))) {
      const p = JSON.parse(fs.readFileSync(path.join(parent, "package.json")));
      if (parent.includes("node_modules")) {
        const files = fs
          .readdirSync(parent)
          .filter((n) => /^(license|licence|copying)(\.|$)/i.test(n));
        let licenseText = files
          .map((n) => fs.readFileSync(path.join(parent, n), "utf8"))
          .join("\n");
        if (!licenseText) {
          const readme = fs.readdirSync(parent).find((n) => /^readme/i.test(n));
          const contents = readme
            ? fs.readFileSync(path.join(parent, readme), "utf8")
            : "";
          licenseText = contents.match(/## License[\s\S]*/i)?.[0];
        }
        if (!licenseText) throw Error(`License text missing for ${p.name}`);
        licenses.set(`${p.name}@${p.version}`, licenseText);
      }
      break;
    }
    parent = path.dirname(parent);
  }
}
fs.writeFileSync(
  path.join(out, "THIRD_PARTY_LICENSES.txt"),
  [...licenses].map(([name, value]) => `${name}\n${value}`).join("\n\n")
);
fs.writeFileSync(
  path.join(out, "bundle-dependencies.json"),
  JSON.stringify([...licenses.keys()].sort(), null, 2) + "\n"
);
console.log(
  `Bundled ${licenses.size} private dependencies; Backstage backend API is an explicit host peer.`
);
