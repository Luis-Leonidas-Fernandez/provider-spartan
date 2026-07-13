import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");

const copyTasks = [
  {
    from: path.join(rootDir, "src/db/migrations"),
    to: path.join(rootDir, "dist/db/migrations"),
  },
];

for (const task of copyTasks) {
  await fs.mkdir(path.dirname(task.to), { recursive: true });
  await fs.cp(task.from, task.to, { recursive: true });
}

