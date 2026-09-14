import { Notice, TAbstractFile, TFile } from "obsidian";
import InkPlugin from "src/main";
import { DeleteNoteWithEmbedsModal } from "src/modals/delete-note-modal/delete-note-with-embeds-modal";
import { findNoteInkEmbedsWithUsage } from "./embed-usage";
import { warn } from "./log-to-console";

////////
////////

/**
 * Wraps `app.fileManager.trashFile` so deleting a note that embeds ink files offers
 * to delete those files too, rather than silently leaving them orphaned in the vault.
 * There's no dedicated "before delete" hook for this in the Obsidian API, and
 * `trashFile` is the one place both the UI's delete action and this plugin's own
 * `RemoveEmbedModal` route every deletion through — wrapping it here means the prompt
 * appears before anything is actually deleted, so cancelling truly cancels.
 */
export function installDeleteNoteWithEmbedsPrompt(plugin: InkPlugin) {
	const fileManager = plugin.app.fileManager;
	const originalTrashFile = fileManager.trashFile.bind(fileManager);

	fileManager.trashFile = async (file: TAbstractFile) => {
		if (!(file instanceof TFile) || file.extension !== 'md') {
			return originalTrashFile(file);
		}

		const embeds = await findNoteInkEmbedsWithUsage(plugin, file);
		if (!embeds.length) return originalTrashFile(file);

		return new Promise<void>((resolve) => {
			new DeleteNoteWithEmbedsModal({
				plugin,
				noteFile: file,
				embeds,
				onChoice: async (choice) => {
					try {
						if (choice === 'cancel') return;

						await originalTrashFile(file);

						if (choice === 'note-and-files') {
							for (const embed of embeds) {
								if (embed.usedElsewhere) continue;
								try {
									await originalTrashFile(embed.inkFile);
								} catch (err) {
									warn(err);
								}
							}
						}
					} catch (err) {
						warn(err);
						new Notice(`Couldn't fully delete ${file.basename}. Check the console for details.`);
					} finally {
						resolve();
					}
				},
			}).open();
		});
	};

	plugin.register(() => { fileManager.trashFile = originalTrashFile; });
}
