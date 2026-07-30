import InkPlugin from "src/main";
import { isEreader } from "./isEreader";

/////////
/////////

export const EREADER_BODY_CLASS = 'inkc_ereader';
export const COARSE_POINTER_BODY_CLASS = 'inkc_coarse-pointer';

/**
 * Tags the document body with the device traits the plugin's styles care about, so
 * CSS can react to them without every component having to detect the device itself.
 *
 * - `inkc_ereader`   — Boox/Onyx. Kills transitions and animations (they ghost badly on
 *                      e-ink), drops shadows and translucency (they dither), raises contrast.
 * - `inkc_coarse-pointer` — finger/stylus-first device. Grows tap targets and keeps hover-only
 *                      controls permanently visible, since there's no hover to reveal them.
 *
 * Classes are removed again when the plugin unloads.
 */
export function applyDeviceClasses(plugin: InkPlugin) {
	const classes: string[] = [];

	if (isEreader()) classes.push(EREADER_BODY_CLASS);
	if (hasCoarsePointer()) classes.push(COARSE_POINTER_BODY_CLASS);

	if (!classes.length) return;

	document.body.addClasses(classes);
	plugin.register(() => document.body.removeClasses(classes));
}

/** True on finger/stylus-first devices, where hover and double-click aren't practical. */
export function hasCoarsePointer(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(pointer: coarse)').matches;
}
