import { readdirSync, statSync, writeFileSync, mkdirSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "fs";
import * as path from "path";
import config from "./configFlatten.json";

const PATH_ROOT = path.resolve(__dirname, config.PATH_ROOT);
const PATH_FLATTENED = path.resolve(__dirname, config.PATH_FLATTENED);
const PATH_IGNORE = config.PATH_IGNORE;

// Require explicit acknowledgement before proceeding
if (!config.ACKNOWLEDGE) {
    console.error(`
ERROR: You must acknowledge the destructive nature of this script before running.

1. This script will destroy your project files and rebuild it. Please ensure that all files are committed and are in version control before running this script.
2. Review the ignored folders/paths as these are the only folders that will not be cleared when running this script.
3. You use it at your own risk.
4. Use the instructions in claude to work with these scripts (found in LLM.md file).

To proceed, set "ACKNOWLEDGE": true in scripts/configFlatten.json
`);
    process.exit(1);
}

// Helper to delete files and directories recursively, skipping ignored paths
function deleteExceptIgnored(dir: string, ignore: string[]) {
    readdirSync(dir).forEach(item => {
        if (ignore.includes(item)) return;
        const itemPath = path.join(dir, item);
        const stats = statSync(itemPath);
        if (stats.isDirectory()) {
            deleteExceptIgnored(itemPath, []); // Only ignore at root
            rmdirSync(itemPath);
        } else {
            unlinkSync(itemPath);
        }
    });
}

// Unflatten: for each file in flattened, reconstruct the original path and write it
function unflattenDirectory(flattenedPath: string, rootPath: string) {
    const files = readdirSync(flattenedPath);
    files.forEach(flatFile => {
        const srcPath = path.join(flattenedPath, flatFile);
        if (!statSync(srcPath).isFile()) return;
        // Reconstruct original relative path
        const relPath = flatFile.split("--").join(path.sep);
        const destPath = path.join(rootPath, relPath);
        const destDir = path.dirname(destPath);
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
        }
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
        console.log(`Restored: ${destPath}`);
    });
}

// 1. Delete all files/folders in project root except ignored
deleteExceptIgnored(PATH_ROOT, PATH_IGNORE);

// 2. Unflatten files from flattened directory
unflattenDirectory(PATH_FLATTENED, PATH_ROOT);