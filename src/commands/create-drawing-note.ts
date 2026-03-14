import InkPlugin from "src/main";
import createNewDrawingFile from "./create-new-drawing-file";
import { buildDrawingEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";
import { openInkFile } from "src/utils/open-file";
import { getDateFilename } from "src/utils/getDateFilename";
import { normalizePath } from "obsidian";
import { getVersionedFilepath } from "src/utils/getVersionedFilepath";

/////////
/////////

const createDrawingNote = async (plugin: InkPlugin) => {
    const drawingFileRef = await createNewDrawingFile(plugin);

    if (plugin.settings.createCompanionNote) {
        const embedStr = buildDrawingEmbed(drawingFileRef.path);
        const noteFilename = getDateFilename() + '.md';
        const notePath = normalizePath(noteFilename);
        const versionedPath = await getVersionedFilepath(plugin, notePath);
        const noteContent = embedStr.trimStart();
        const noteRef = await plugin.app.vault.create(versionedPath, noteContent);

        activateNextEmbed();
        const leaf = plugin.app.workspace.getLeaf();
        await leaf.openFile(noteRef);
    } else {
        await openInkFile(plugin, drawingFileRef);
    }
}

export default createDrawingNote;
