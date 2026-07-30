import { TFile, normalizePath } from "obsidian";
import { DRAW_FILE_EXT, NOTEBOOK_FILE_EXT, WRITE_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { getDateFilename } from "./getDateFilename";
import { getVersionedFilepath } from "./getVersionedFilepath";
import { getBaseAttachmentPath } from "./getBaseAttachmentPath";
import { getWritingSubfolderPath, getDrawingSubfolderPath, getNotebookSubfolderPath } from "./getSubfolderPaths";
import { parseFilepath } from "./parseFilepath";
import { getObsidianAttachmentFolderPath } from "./obsidian-interfaces";
import { debug } from "./log-to-console";

/////////
/////////

export const getNewTimestampedWritingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null, basenameOverride?: string): Promise<string> => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getWritingSubfolderPath(plugin);
    const fullPath = await getNewInkFilepath(plugin, WRITE_FILE_EXT, `${basePath}/${subFolderPath}`, instigatingFile, basenameOverride);
    return fullPath;
}

export const getNewTimestampedDrawingFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null, basenameOverride?: string) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getDrawingSubfolderPath(plugin);
    const fullPath = await getNewInkFilepath(plugin, DRAW_FILE_EXT, `${basePath}/${subFolderPath}`, instigatingFile, basenameOverride);
    return fullPath;
}

export const getNewTimestampedNotebookFilepath = async (plugin: InkPlugin, instigatingFile?: TFile | null, basenameOverride?: string) => {
    const obsAttachmentFolderPath = await getObsidianAttachmentFolderPath(plugin);
    const instigatingFileFolderPath = instigatingFile ? parseFilepath(instigatingFile?.path).folderpath : null;
    let basePath = await getBaseAttachmentPath(plugin, {
        obsAttachmentFolderPath,
        instigatingFileFolderPath,
    });
    let subFolderPath = getNotebookSubfolderPath(plugin);
    const fullPath = await getNewInkFilepath(plugin, NOTEBOOK_FILE_EXT, `${basePath}/${subFolderPath}`, instigatingFile, basenameOverride);
    return fullPath;
}

const getNewInkFilepath = async (
    plugin: InkPlugin,
    ext: string,
    folderPath: string,
    instigatingFile?: TFile | null,
    basenameOverride?: string,
): Promise<string> => {
    const filename = getNewInkBasename(plugin, instigatingFile, basenameOverride) + '.' + ext;
    const versionedFilepath = await getVersionedFilepath(plugin, `${folderPath}/${filename}`);
    return normalizePath(versionedFilepath);
}

/**
 * Names new ink files after the note they're being embedded in, so a writing file is
 * findable by the note it belongs to rather than by the minute it was created.
 * Falls back to a timestamp when there's no note to name it after (or the setting is off).
 * getVersionedFilepath() appends ' (2)', ' (3)', etc. for the second and later files in a note.
 */
const getNewInkBasename = (plugin: InkPlugin, instigatingFile?: TFile | null, basenameOverride?: string): string => {
    const preferredBasename = basenameOverride ?? instigatingFile?.basename;

    if (plugin.settings.nameFilesAfterNote && preferredBasename) {
        const sanitised = sanitiseBasename(preferredBasename);
        if (sanitised) return sanitised;
    }

    return getDateFilename();
}

/**
 * Note names can legally contain characters that ink filenames can't carry safely
 * (a '/' would nest the file into a folder, a '#' or '|' breaks the [[wikilink]]
 * the embed stores). Strip those rather than refusing to name the file.
 */
const sanitiseBasename = (basename: string): string => {
    return basename
        .replace(/[\\/:*?"<>|#^[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

//////////////
//////////////
