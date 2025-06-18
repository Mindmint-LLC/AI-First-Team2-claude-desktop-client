import { readdirSync, statSync, writeFileSync, mkdirSync, readFileSync, unlinkSync, rmdirSync } from "fs";
import * as path from "path";
import config from "./configFlatten.json";
import { generateManifest } from "./manifest";

const PATH_INPUT = path.resolve(__dirname, config.PATH_ROOT);
const PATH_OUTPUT = path.resolve(__dirname, config.PATH_FLATTENED);
const PATH_IGNORE = config.PATH_IGNORE;

// Helper to delete files and directories recursively
function deleteFileSync(filePath: string) {
    if (!statSync(filePath)) return;
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
        readdirSync(filePath).forEach(child => {
            deleteFileSync(path.join(filePath, child));
        });
        rmdirSync(filePath);
    } else {
        unlinkSync(filePath);
    }
}

// Recursively flattens the directory structure such as:
// src/components/Button.tsx   -> src--components--Button.tsx
// Where the / is --
// Copying all the files to a new directory with the new names
export function flattenDirectoryStructure(
    inputPath: string = PATH_INPUT,
    outputPath: string = PATH_OUTPUT
) {
    if (!statSync(inputPath).isDirectory()) return;
    const items = readdirSync(inputPath);

    items.forEach(item => {
        if (PATH_IGNORE.includes(item)) return;
        const itemPath = path.join(inputPath, item);
        const stats = statSync(itemPath);

        if (stats.isDirectory()) {
            flattenDirectoryStructure(itemPath, outputPath);
        } else if (stats.isFile()) {
            // Flattened name: replace all path separators with --
            const relativePath = path.relative(PATH_INPUT, itemPath);
            const flattenedName = relativePath.split(path.sep).join("--");
            const destPath = path.join(outputPath, flattenedName);
            console.log(`Copying: ${itemPath} -> ${destPath}`); // Log the copying action
            const content = readFileSync(itemPath);
            writeFileSync(destPath, content);
        }
    });
}
function setupDirectory() {
    try {
        if (statSync(PATH_OUTPUT).isDirectory()) {
            // delete all files and folders in the directory
            readdirSync(PATH_OUTPUT).forEach(file => {
                const filePath = path.join(PATH_OUTPUT, file);
                deleteFileSync(filePath);
            });
        } else {
            mkdirSync(PATH_OUTPUT, {recursive: true});
        }
    } catch (err) {
        console.error("Could not create output directory:", err);
    }
}

setupDirectory();
flattenDirectoryStructure();
generateManifest();