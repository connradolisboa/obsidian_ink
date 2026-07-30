import './remove-embed-modal.scss';
import { ButtonComponent, Modal, Notice, Setting, TFile } from "obsidian";
import InkPlugin from "src/main";
import { InkEmbedUsage, findInkEmbedUsages, removeAllInkEmbedsInVault } from "src/utils/embed-usage";
import { warn } from "src/utils/log-to-console";

////////
////////

const MAX_LISTED_NOTES = 6;

type RemoveEmbedModalOptions = {
	plugin: InkPlugin,
	/** Human readable file type. i.e. 'writing', 'drawing', 'notebook' */
	filetype: string,
	inkFile: TFile,
	/** Path of the note the embed being removed lives in. */
	sourcePath: string,
	/** Removes just this one embed from this one note. */
	removeThisEmbed: () => void,
};

export class RemoveEmbedModal extends Modal {
	private plugin: InkPlugin;
	private filetype: string;
	private inkFile: TFile;
	private sourcePath: string;
	private removeThisEmbed: () => void;

	private usages: InkEmbedUsage[] | null = null;	// null while still scanning
	private bodyEl: HTMLElement;
	private actionsEl: HTMLElement;

	constructor(options: RemoveEmbedModalOptions) {
		super(options.plugin.app);
		this.plugin = options.plugin;
		this.filetype = options.filetype;
		this.inkFile = options.inkFile;
		this.sourcePath = options.sourcePath;
		this.removeThisEmbed = options.removeThisEmbed;
	}

	onOpen() {
		const { titleEl, contentEl, modalEl } = this;

		modalEl.addClass('inkc_modal');
		titleEl.setText('Remove embed');

		this.bodyEl = contentEl.createDiv('inkc_modal-body');
		this.actionsEl = contentEl.createDiv('inkc_modal-actions-row');

		this.renderScanning();
		this.scan();
	}

	onClose() {
		this.contentEl.empty();
	}

	// Rendering
	////////////

	private renderScanning() {
		this.bodyEl.empty();
		this.actionsEl.empty();

		this.bodyEl.createEl('p', {
			cls: 'inkc_modal-message inkc_is-muted',
			text: `Checking where this ${this.filetype} file is embedded…`,
		});

		new Setting(this.actionsEl)
			.setClass('inkc_modal-actions')
			.addButton(btn => this.buildCancelButton(btn));
	}

	private render() {
		if (!this.usages) return;

		this.bodyEl.empty();
		this.actionsEl.empty();

		const totalEmbeds = this.usages.reduce((sum, usage) => sum + usage.count, 0);
		const otherNotes = this.usages.filter(usage => usage.noteFile.path !== this.sourcePath);
		const embedsInThisNote = this.usages.find(u => u.noteFile.path === this.sourcePath)?.count ?? 0;
		const onlyHere = totalEmbeds - embedsInThisNote === 0;

		this.bodyEl.createEl('p', {
			cls: 'inkc_modal-message',
			text: onlyHere
				? `This ${this.filetype} file is only embedded in this note. Do you want to remove the embed only, or also delete the file from your vault?`
				: `This ${this.filetype} file is embedded in ${pluralise(totalEmbeds, 'place')} across ${pluralise(this.usages.length, 'note')}. You can remove just this embed, or delete the file along with every embed of it.`,
		});

		if (otherNotes.length) this.renderOtherNotesList(otherNotes);

		new Setting(this.actionsEl)
			.setClass('inkc_modal-actions')
			.addButton(btn => this.buildCancelButton(btn))
			.addButton(btn => {
				btn.setClass('inkc_button');
				btn.setWarning();
				btn.setButtonText(onlyHere ? 'Remove and delete file' : `Delete file and all ${totalEmbeds} embeds`);
				btn.onClick(() => this.deleteFileAndAllEmbeds());
			})
			.addButton(btn => {
				btn.setClass('inkc_button');
				btn.setCta();
				btn.setButtonText(onlyHere ? 'Remove embed' : 'Remove this embed');
				btn.onClick(() => {
					this.close();
					this.removeThisEmbed();
				});
				// So Enter picks the non-destructive option.
				window.setTimeout(() => btn.buttonEl.focus(), 0);
			});
	}

	private renderOtherNotesList(otherNotes: InkEmbedUsage[]) {
		const listEl = this.bodyEl.createEl('ul', { cls: 'inkc_modal-note-list' });

		otherNotes.slice(0, MAX_LISTED_NOTES).forEach(usage => {
			const itemEl = listEl.createEl('li');
			const linkEl = itemEl.createEl('a', {
				text: usage.noteFile.basename,
				cls: 'inkc_modal-note-link',
			});
			linkEl.addEventListener('click', (ev) => {
				ev.preventDefault();
				this.close();
				this.plugin.app.workspace.getLeaf().openFile(usage.noteFile);
			});
			if (usage.count > 1) {
				itemEl.createSpan({ cls: 'inkc_modal-note-count', text: ` ×${usage.count}` });
			}
		});

		const overflow = otherNotes.length - MAX_LISTED_NOTES;
		if (overflow > 0) {
			listEl.createEl('li', {
				cls: 'inkc_is-muted',
				text: `and ${pluralise(overflow, 'other note')}`,
			});
		}
	}

	private buildCancelButton(btn: ButtonComponent) {
		btn.setClass('inkc_backward-button');
		btn.setButtonText('Cancel');
		btn.onClick(() => this.close());
	}

	// Actions
	//////////

	private async scan() {
		try {
			this.usages = await findInkEmbedUsages(this.plugin, this.inkFile);
		} catch (err) {
			warn(err);
			// Fall back to treating it as embedded here only, so the modal stays usable.
			this.usages = [];
		}
		// The user may have closed the modal while the scan was running.
		if (this.bodyEl.isConnected) this.render();
	}

	private async deleteFileAndAllEmbeds() {
		this.close();

		try {
			// This embed is removed through the caller's own handler, which knows
			// exactly which block it came from. The vault scan then picks up the rest,
			// so the file is never trashed while an embed of it is left behind.
			this.removeThisEmbed();
			const removedElsewhere = await removeAllInkEmbedsInVault(this.plugin, this.inkFile);

			await this.plugin.app.fileManager.trashFile(this.inkFile);
			new Notice(`Deleted ${this.inkFile.basename} and removed ${pluralise(removedElsewhere + 1, 'embed')}.`);
		} catch (err) {
			warn(err);
			new Notice(`Couldn't fully delete this ${this.filetype} file. Check the console for details.`);
		}
	}
}

////////
////////

/**
 * Opens the remove embed flow for an ink embed.
 * Falls straight through to removing the embed if the file can't be resolved.
 */
export function promptRemoveInkEmbed(options: Omit<RemoveEmbedModalOptions, 'inkFile'> & { inkFile: TFile | null }) {
	const { inkFile } = options;
	if (!inkFile) {
		options.removeThisEmbed();
		return;
	}
	new RemoveEmbedModal({ ...options, inkFile }).open();
}

function pluralise(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
