/** build の最後に、建てた commit を dist/build-info.json に書く（`src/build-info.ts`）。 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_INFO_FILE, gitHead } from "../build-info.js";

const repoDir = process.cwd();
const commit = gitHead(repoDir);
if (commit === undefined) {
  process.stderr.write(
    "write-build-info: git の checkout ではないので、build-info.json を書かない\n",
  );
} else {
  writeFileSync(join(repoDir, "dist", BUILD_INFO_FILE), `${JSON.stringify({ commit })}\n`);
}
