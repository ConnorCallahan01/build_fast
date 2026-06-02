import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));

export function packageRoot() {
  return path.resolve(sourceDir, "..");
}

export function packagePath(...parts) {
  return path.join(packageRoot(), ...parts);
}
