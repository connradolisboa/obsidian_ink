import { Modal, Setting } from "obsidian";
import InkPlugin from "src/main";

////////
////////

/** Offered alongside the free-text field so the common cases need no typing — which matters on a
 *  tablet, where summoning a keyboard to enter "400" costs more than the setting is worth. */
const PRESETS: { label: string, px: number }[] = [
	{ label: 'Short', px: 300 },
	{ label: 'Medium', px: 500 },
	{ label: 'Tall', px: 800 },
];

const MIN_HEIGHT_PX = 120;

const SCALES: { label: string, value: number }[] = [
	{ label: 'Full size', value: 1 },
	{ label: '85%', value: 0.85 },
	{ label: '70%', value: 0.7 },
	{ label: '55%', value: 0.55 },
];

export class EmbedHeightModal extends Modal {
	private currentHeight?: number;
	private currentScale?: number;
	private onSubmit: (display: { maxHeight: number | undefined, scale: number | undefined }) => void;

	constructor(options: {
		plugin: InkPlugin,
		currentHeight?: number,
		currentScale?: number,
		onSubmit: (display: { maxHeight: number | undefined, scale: number | undefined }) => void,
	}) {
		super(options.plugin.app);
		this.currentHeight = options.currentHeight;
		this.currentScale = options.currentScale;
		this.onSubmit = options.onSubmit;
	}

	onOpen() {
		const { titleEl, contentEl } = this;

		titleEl.setText('Embed display');
		contentEl.createEl('p', {
			text: 'Control how much room this embed takes in the note. Capping the height makes longer writing scroll inside it instead of pushing the note down; scaling shows more of the writing in the same space. Both affect only this embed.',
		});

		let draft = this.currentHeight;
		let draftScale = this.currentScale ?? 1;

		const heightSetting = new Setting(contentEl)
			.setName('Maximum height')
			.setDesc(`In pixels. Minimum ${MIN_HEIGHT_PX}.`)
			.addText(text => {
				text.setPlaceholder('No limit');
				text.setValue(this.currentHeight ? String(this.currentHeight) : '');
				text.onChange(value => {
					const parsed = parseInt(value, 10);
					draft = isNaN(parsed) ? undefined : Math.max(MIN_HEIGHT_PX, parsed);
				});
			});

		const presetSetting = new Setting(contentEl).setName('Presets');
		PRESETS.forEach(preset => {
			presetSetting.addButton(btn => {
				btn.setButtonText(preset.label);
				btn.onClick(() => {
					this.close();
					this.onSubmit({ maxHeight: preset.px, scale: draftScale === 1 ? undefined : draftScale });
				});
			});
		});

		new Setting(contentEl)
			.setName('Scale')
			.setDesc('Renders the writing smaller so more of it fits.')
			.addDropdown(dropdown => {
				SCALES.forEach(s => dropdown.addOption(String(s.value), s.label));
				// An unrecognised stored value would otherwise silently show as "Full size".
				if (!SCALES.some(s => s.value === draftScale)) {
					dropdown.addOption(String(draftScale), `${Math.round(draftScale * 100)}%`);
				}
				dropdown.setValue(String(draftScale));
				dropdown.onChange(value => {
					const parsed = parseFloat(value);
					draftScale = isNaN(parsed) ? 1 : parsed;
				});
			});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Reset');
				btn.onClick(() => {
					this.close();
					this.onSubmit({ maxHeight: undefined, scale: undefined });
				});
			})
			.addButton(btn => {
				btn.setCta();
				btn.setButtonText('Apply');
				btn.onClick(() => {
					this.close();
					this.onSubmit({ maxHeight: draft, scale: draftScale === 1 ? undefined : draftScale });
				});
			});

		// Keeps the field usable with a hardware keyboard without forcing a trip to the button.
		heightSetting.controlEl.querySelector('input')?.addEventListener('keydown', (ev: KeyboardEvent) => {
			if (ev.key !== 'Enter') return;
			ev.preventDefault();
			this.close();
			this.onSubmit({ maxHeight: draft, scale: draftScale === 1 ? undefined : draftScale });
		});
	}

	onClose() {
		const { titleEl, contentEl } = this;
		titleEl.empty();
		contentEl.empty();
	}
}
