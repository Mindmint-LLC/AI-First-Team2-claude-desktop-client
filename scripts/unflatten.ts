import { readdirSync, statSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import * as path from "path";
import config from "./configFlatten.json";

const PATH_FLATTENED = path.resolve(__dirname, config.PATH_FLATTENED);
const PATH_IGNORE = config.PATH_IGNORE;
const PATH_UNFLATTEN_DIR = path.resolve(__dirname, config.UNFLATTEN_DIR);

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

// Helper to extract the File property from the header
function extractFileHeader(content: string): string | null {
    const match = content.match(/^\s*\/\*\*[\s\S]*?File:\s*([^\s*]+)[\s\S]*?\*\//);
    return match ? match[1].trim() : null;
}

function unflattenDirectory(flattenedPath: string, unflattenDir: string) {
    const files = readdirSync(flattenedPath);
    files.forEach(flatFile => {
        const srcPath = path.join(flattenedPath, flatFile);
        if (!statSync(srcPath).isFile()) return;
        const contentBuf = readFileSync(srcPath);
        const contentStr = contentBuf.toString();

        let destPath: string;
        if (!flatFile.includes("--")) {
            // Try to extract File property from header
            const fileHeader = extractFileHeader(contentStr);
            if (fileHeader) {
                destPath = path.join(unflattenDir, fileHeader);
            } else {
                destPath = path.join(unflattenDir, flatFile);
            }
        } else {
            // Reconstruct original relative path
            const relPath = flatFile.split("--").join(path.sep);
            destPath = path.join(unflattenDir, relPath);
        }
        const destDir = path.dirname(destPath);
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
        }
        writeFileSync(destPath, contentBuf);
        console.log(`Restored: ${destPath}`);
    });
}

unflattenDirectory(PATH_FLATTENED, PATH_UNFLATTEN_DIR);
