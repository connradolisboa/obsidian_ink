import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import { defaultTLEditorNotebookSnapshot } from "src/defaults/default-tleditor-notebook-snapshot";
import { getNewTimestampedNotebookFilepath } from "src/utils/file-manipulation";
import { createFoldersForFilepath } from "src/utils/createFoldersForFilepath";
import { TFile } from "obsidian";

////////
////////

const createNewNotebookFile = async (plugin: InkPlugin, instigatingFile?: TFile | null) => {
    const filepath = await getNewTimestampedNotebookFilepath(plugin, instigatingFile);
    const pageData = buildWritingFileData({
        tlEditorSnapshot: defaultTLEditorNotebookSnapshot,
    });
    await createFoldersForFilepath(plugin, filepath);
    const fileRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return fileRef;
}

export default createNewNotebookFile;
