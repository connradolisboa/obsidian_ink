import InkPlugin from "src/main";
import createNewWritingFile from "./create-new-writing-file";
import { buildWritingEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";
import { openInkFile } from "src/utils/open-file";
import { getDateFilename } from "src/utils/getDateFilename";
import { normalizePath } from "obsidian";
import { getVersionedFilepath } from "src/utils/getVersionedFilepath";
import { parseFilepath } from "src/utils/parseFilepath";

/////////
/////////

const createWritingNote = async (plugin: InkPlugin) => {

    if (plugin.settings.createCompanionNote) {
        // The note is created first so the writing file can take its name.
        const notePath = normalizePath(getDateFilename() + '.md');
        const versionedPath = await getVersionedFilepath(plugin, notePath);
        const noteBasename = parseFilepath(versionedPath).basename;

        const writingFileRef = await createNewWritingFile(plugin, null, noteBasename);
        const noteContent = buildWritingEmbed(writingFileRef.path).trimStart();
        const noteRef = await plugin.app.vault.create(versionedPath, noteContent);

        activateNextEmbed();
        const leaf = plugin.app.workspace.getLeaf();
        await leaf.openFile(noteRef);
    } else {
        const writingFileRef = await createNewWritingFile(plugin);
        await openInkFile(plugin, writingFileRef);
    }
}

export default createWritingNote;
