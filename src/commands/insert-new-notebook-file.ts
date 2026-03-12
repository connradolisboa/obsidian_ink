import InkPlugin from "src/main";
import createNewNotebookFile from "./create-new-notebook-file";
import { Editor } from "obsidian";
import { buildNotebookEmbed } from "src/utils/embed";
import { activateNextEmbed } from "src/utils/storage";

/////////
/////////

const insertNewNotebookFile = async (plugin: InkPlugin, editor: Editor) => {
    const activeFile = plugin.app.workspace.getActiveFile();
    const fileRef = await createNewNotebookFile(plugin, activeFile);
    let embedStr = buildNotebookEmbed(fileRef.path);

    activateNextEmbed();
    const positionForEmbed = editor.getCursor();
    editor.replaceRange( embedStr, positionForEmbed );
    const positionForCursor = {...positionForEmbed};

    const embedLines = embedStr.split(/\r\n|\r|\n/);
    positionForCursor.line += embedLines.length;
    editor.setCursor(positionForCursor)
}

export default insertNewNotebookFile;
