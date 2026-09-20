// Node determines whether a plain .js file is CommonJS or ESM from the
// nearest package.json's "type" field — the root package.json here has
// no "type" (defaults to CommonJS), so without this, dist/esm's `export`
// syntax would be parsed as CommonJS and fail immediately. Scoping "type"
// per output directory (rather than setting it at the package root, which
// would break the CJS build instead) is the standard way to ship both
// formats from one package.
const fs = require("fs");
const path = require("path");

// Directories may not exist yet if this runs before tsc's first compile
// (see the "dev" script, which writes these markers up front so they're
// in place the moment the watcher's first output lands).
fs.mkdirSync(path.join(__dirname, "../dist/cjs"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "../dist/esm"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../dist/cjs/package.json"), JSON.stringify({ type: "commonjs" }));
fs.writeFileSync(path.join(__dirname, "../dist/esm/package.json"), JSON.stringify({ type: "module" }));
