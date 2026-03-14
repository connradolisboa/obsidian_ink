import InkPlugin from "src/main";
import createNewWritingFile from "./create-new-writing-file";
import { buildWritingEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";
import { openInkFile } from "src/utils/open-file";
import { getDateFilename } from "src/utils/getDateFilename";
import { normalizePath } from "obsidian";
import { getVersionedFilepath } from "src/utils/getVersionedFilepath";

/////////
/////////

const createWritingNote = async (plugin: InkPlugin) => {
    const writingFileRef = await createNewWritingFile(plugin);

    if (plugin.settings.createCompanionNote) {
        const embedStr = buildWritingEmbed(writingFileRef.path);
        const noteFilename = getDateFilename() + '.md';
        const notePath = normalizePath(noteFilename);
        const versionedPath = await getVersionedFilepath(plugin, notePath);
        const noteContent = embedStr.trimStart();
        const noteRef = await plugin.app.vault.create(versionedPath, noteContent);

        activateNextEmbed();
        const leaf = plugin.app.workspace.getLeaf();
        await leaf.openFile(noteRef);
    } else {
        await openInkFile(plugin, writingFileRef);
    }
}

export default createWritingNote;
