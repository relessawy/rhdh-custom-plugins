import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = process.argv[2];
if (!["jenkins-stage-progress", "snyk-security", "splunk-logs", "jira-work-items"].includes(plugin))
  throw Error("Unknown plugin");
const p = path.join(root, "plugins", plugin),
  version = JSON.parse(
    fs.readFileSync(path.join(p, "frontend/package.json"))
  ).version;
const out = path.join(root, "artifacts", plugin, version);
fs.mkdirSync(out, { recursive: true });
const sums = [],
  entries = [];
for (const part of ["frontend", "backend"]) {
  const tmp = fs.mkdtempSync(path.join(out, ".package-")),
    target = path.join(tmp, "package");
  fs.mkdirSync(target);
  if (part === "frontend") {
    const src = path.join(p, part, "dist-dynamic");
    fs.copyFileSync(
      path.join(src, "package.json"),
      path.join(target, "package.json")
    );
    fs.cpSync(
      path.join(src, "dist-scalprum"),
      path.join(target, "dist-scalprum"),
      { recursive: true, filter: (s) => !s.endsWith(".map") }
    );
  } else
    fs.cpSync(path.join(p, part, "dist-dynamic"), target, { recursive: true });
  fs.copyFileSync(path.join(root, "LICENSE"), path.join(target, "LICENSE"));
  const name = `${plugin}-${part}-${version}.tgz`;
  execFileSync("tar", ["-czf", path.join(out, name), "-C", tmp, "package"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  fs.rmSync(tmp, { recursive: true });
  const bytes = fs.readFileSync(path.join(out, name));
  sums.push(
    `${crypto.createHash("sha256").update(bytes).digest("hex")}  ${name}`
  );
  entries.push({
    part,
    name,
    integrity:
      "sha512-" + crypto.createHash("sha512").update(bytes).digest("base64"),
  });
}
fs.writeFileSync(path.join(out, "SHA256SUMS"), sums.join("\n") + "\n");
fs.writeFileSync(
  path.join(out, "packages.json"),
  JSON.stringify(entries, null, 2) + "\n"
);
const wiring = fs.readFileSync(
  path.join(p, "examples/frontend-wiring.yaml"),
  "utf8"
);
fs.writeFileSync(
  path.join(out, "dynamic-plugins.yaml"),
  "plugins:\n" +
    entries
      .map(
        (e) =>
          `  - package: https://plugins.example.com/${e.name}\n    integrity: ${e.integrity}\n    disabled: false\n` +
          (e.part === "frontend"
            ? "    pluginConfig:\n" +
              wiring
                .split("\n")
                .filter(Boolean)
                .map((l) => "      " + l)
                .join("\n") +
              "\n"
            : "")
      )
      .join("")
);
console.log(`Packages and integrity-pinned installation config: ${out}`);
