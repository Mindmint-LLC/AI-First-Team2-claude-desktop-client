
import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';
import config from './configFlatten.json';

const MANIFEST_FILE_NAME = 'manifest.json';
const MANIFEST_PATH = path.resolve(__dirname, config.PATH_FLATTENED, MANIFEST_FILE_NAME);

export function generateManifest() {
    const SRC_DIR = path.resolve(__dirname, '../src');

    // Helper to extract header comment from a file
    function extractHeader(content: string): string | null {
        const match = content.match(/^\s*\/\*[\s\S]*?\*\//);
        return match ? match[0] : null;
    }

    // Scan for .ts and .js files
    const files = glob.sync(`${SRC_DIR}/**/*.{ts,js,tsx,jsx}`);

    const manifest: Record<string, string> = {};

    files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        const header = extractHeader(content);
        if (header) {
            // Save relative path and header
            manifest[path.relative(SRC_DIR, file)] = header;
        }
    });

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`Manifest generated at ${MANIFEST_PATH}`);
}
