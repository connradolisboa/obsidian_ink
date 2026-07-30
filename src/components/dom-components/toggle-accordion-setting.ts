import './toggle-accordion-setting.scss';
import { Setting, ToggleComponent } from "obsidian";

//////////////
//////////////

export class ToggleAccordionSetting {
	containerEl: HTMLElement;
	toggleSetting: Setting;
	toggle: ToggleComponent;
	sectionEl: HTMLElement;
	sectionHeaderEl: HTMLElement;
	sectionContentEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
		this.sectionEl = this.containerEl.createDiv('inkc_toggle-accordion');
		this.sectionHeaderEl = this.sectionEl.createDiv('inkc_toggle-accordion-header');
		this.sectionContentEl = this.sectionEl.createDiv('inkc_toggle-accordion-content');
		this.toggleSetting = new Setting(this.sectionHeaderEl)
			.setClass('inkc_setting')
			.addToggle((toggle) => this.toggle = toggle);
		return this;
	}

	setName(name: string): ToggleAccordionSetting {
		this.toggleSetting.setName(name);
		return this;
	}

	setDesc(desc: string): ToggleAccordionSetting {
		this.toggleSetting.setDesc(desc);
		return this;
	}

	setExpanded(expanded: boolean): ToggleAccordionSetting {
		this.toggle.setValue(expanded);
		if(expanded) {
			this.sectionEl.classList.add('inkc_expanded');
			} else {
			this.sectionEl.classList.remove('inkc_expanded');
		}
		return this;
	}

	onToggle(toggleHandler: (value: boolean) => any): ToggleAccordionSetting {
		this.toggle.onChange(toggleHandler);
		return this;
	}

	setContent(contentHandler: (container: HTMLElement) => any) {
		contentHandler(this.sectionContentEl);
		return this;
	}

}