import '../remove-embed-modal/remove-embed-modal.scss';
import { Modal, Setting, TFile } from "obsidian";
import InkPlugin from "src/main";
import { NoteInkEmbedWithUsage } from "src/utils/embed-usage";

////////
////////

export type DeleteNoteChoice = 'cancel' | 'note-only' | 'note-and-files';

type DeleteNoteWithEmbedsModalOptions = {
	plugin: InkPlugin,
	noteFile: TFile,
	embeds: NoteInkEmbedWithUsage[],
	onChoice: (choice: DeleteNoteChoice) => void,
};

export class DeleteNoteWithEmbedsModal extends Modal {
	private embeds: NoteInkEmbedWithUsage[];
	private onChoice: (choice: DeleteNoteChoice) => void;
	private settled = false;

	constructor(options: DeleteNoteWithEmbedsModalOptions) {
		super(options.plugin.app);
		this.embeds = options.embeds;
		this.onChoice = options.onChoice;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		const deletable = this.embeds.filter(embed => !embed.usedElsewhere);

		contentEl.addClass('inkc_modal');
		titleEl.setText('Delete note');

		const bodyEl = contentEl.createDiv('inkc_modal-body');

		bodyEl.createEl('p', {
			cls: 'inkc_modal-message',
			text: deletable.length
				? `This note has ${pluralise(this.embeds.length, 'embedded ink file')}. Delete just the note, or the note and ${deletable.length === this.embeds.length ? 'the embedded' : 'its unshared embedded'} ${pluralise(deletable.length, 'file')} too?`
				: `This note has ${pluralise(this.embeds.length, 'embedded ink file')}, but ${this.embeds.length === 1 ? "it's" : "they're"} also embedded elsewhere, so only the note itself will be deleted.`,
		});

		const listEl = bodyEl.createEl('ul', { cls: 'inkc_modal-note-list' });
		this.embeds.forEach(embed => {
			const itemEl = listEl.createEl('li', { text: `${embed.inkFile.basename} (${embed.filetype})` });
			if (embed.usedElsewhere) {
				itemEl.createSpan({ cls: 'inkc_modal-note-count', text: ' — kept, used elsewhere' });
			}
		});

		const actionsEl = contentEl.createDiv('inkc_modal-actions-row');
		const setting = new Setting(actionsEl).setClass('inkc_modal-actions');

		setting.addButton(btn => {
			btn.setClass('inkc_backward-button');
			btn.setButtonText('Cancel');
			btn.onClick(() => this.choose('cancel'));
		});

		if (deletable.length) {
			setting.addButton(btn => {
				btn.setClass('inkc_button');
				btn.setWarning();
				btn.setButtonText(`Delete note and ${pluralise(deletable.length, 'file')}`);
				btn.onClick(() => this.choose('note-and-files'));
			});
		}

		setting.addButton(btn => {
			btn.setClass('inkc_button');
			btn.setCta();
			btn.setButtonText('Delete note only');
			btn.onClick(() => this.choose('note-only'));
			// So Enter picks the least destructive default.
			window.setTimeout(() => btn.buttonEl.focus(), 0);
		});
	}

	onClose() {
		this.contentEl.empty();
		// Esc / click-outside without picking a button — treat it the same as Cancel.
		this.choose('cancel');
	}

	private choose(choice: DeleteNoteChoice) {
		if (this.settled) return;
		this.settled = true;
		this.close();
		this.onChoice(choice);
	}
}

function pluralise(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
