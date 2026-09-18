import { Modal, Setting } from "obsidian";
import InkPlugin from "src/main";

////////
////////

export type PasteEmbedChoice = 'reference' | 'duplicate';

/**
 * Asked when an ink embed is pasted, because the two outcomes are indistinguishable at the point
 * of pasting and very distinguishable afterwards — a reference means editing either copy changes
 * both, which is either the feature or the bug depending on what was intended.
 */
export class PasteEmbedModal extends Modal {
	private onChoice: (choice: PasteEmbedChoice) => void;

	constructor(options: {
		plugin: InkPlugin,
		onChoice: (choice: PasteEmbedChoice) => void,
	}) {
		super(options.plugin.app);
		this.onChoice = options.onChoice;
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText('Paste ink embed');
		contentEl.createEl('p', {
			text: 'Should this embed show the same ink file, or a copy of it?',
		});
		contentEl.createEl('p', {
			text: 'Referencing the same file means edits in either place appear in both. A copy starts identical and then goes its own way.',
			cls: 'mod-warning',
		});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Make a copy');
				btn.onClick(() => {
					this.close();
					this.onChoice('duplicate');
				});
			})
			.addButton(btn => {
				btn.setCta();
				btn.setButtonText('Reference the same file');
				btn.onClick(() => {
					this.close();
					this.onChoice('reference');
				});
			});
	}

	onClose() {
		const { titleEl, contentEl } = this;
		titleEl.empty();
		contentEl.empty();
	}
}
