import InkPlugin from "src/main";
import createNewDrawingFile from "./create-new-drawing-file";
import { buildDrawingEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";
import { openInkFile } from "src/utils/open-file";
import { getDateFilename } from "src/utils/getDateFilename";
import { normalizePath } from "obsidian";
import { getVersionedFilepath } from "src/utils/getVersionedFilepath";
import { parseFilepath } from "src/utils/parseFilepath";

/////////
/////////

const createDrawingNote = async (plugin: InkPlugin) => {

    if (plugin.settings.createCompanionNote) {
        // The note is created first so the drawing file can take its name.
        const notePath = normalizePath(getDateFilename() + '.md');
        const versionedPath = await getVersionedFilepath(plugin, notePath);
        const noteBasename = parseFilepath(versionedPath).basename;

        const drawingFileRef = await createNewDrawingFile(plugin, null, noteBasename);
        const noteContent = buildDrawingEmbed(drawingFileRef.path).trimStart();
        const noteRef = await plugin.app.vault.create(versionedPath, noteContent);

        activateNextEmbed();
        const leaf = plugin.app.workspace.getLeaf();
        await leaf.openFile(noteRef);
    } else {
        const drawingFileRef = await createNewDrawingFile(plugin);
        await openInkFile(plugin, drawingFileRef);
    }
}

export default createDrawingNote;
