import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor, TldrawDrawingEditorWrapper } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview, DrawingEmbedPreviewWrapper } from "./drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { DrawingEmbedData } from "src/utils/embed";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { atom, useAtom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { getFullPageWidth } from "src/utils/getFullPageWidth";
import { verbose } from "src/utils/log-to-console";
import { CollapseIcon } from "src/graphics/icons/collapse-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { hasCoarsePointer } from "src/utils/device-classes";
const emptyDrawingSvgStr = require('../../placeholders/empty-drawing-embed.svg');

///////
///////


export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(DrawingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.preview
})

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	drawingFileRef: TFile,
	pageData: InkFileData,
	embedData?: DrawingEmbedData,
	saveSrcFile: (pageData: InkFileData) => {},
	setEmbedProps: (width: number, height: number) => void,
	remove: Function,
	width?: number,
	aspectRatio?: number,
	onCollapsedChange?: (collapsed: boolean) => void,
	onTitleChange?: (title: string) => void,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);

	const setEmbedState = useSetAtom(embedStateAtom);
	const [collapsed, setCollapsed] = useState(props.embedData?.collapsed ?? false);
	const [title, setTitle] = useState(props.drawingFileRef.basename);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	function handleCollapsedChange(value: boolean) {
		setCollapsed(value);
		props.onCollapsedChange?.(value);
	}

	function handleTitleCommit(newTitle: string) {
		const trimmed = newTitle.trim() || props.drawingFileRef.basename;
		setTitle(trimmed);
		setIsEditingTitle(false);
		props.onTitleChange?.(trimmed);
	}

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			setTimeout( () => {
				switchToEditMode();
			},200);
		}

		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [])

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			icon: 'copy',
			section: 'inkc-file',
			action: async () => {
				await rememberDrawingFile(props.plugin, props.drawingFileRef);
			}
		},
		{
			text: 'Open drawing',
			icon: 'maximize',
			section: 'inkc-file',
			action: async () => {
				openInkFile(props.plugin, props.drawingFileRef)
			}
		},
		{
			text: 'Remove embed',
			icon: 'trash-2',
			section: 'inkc-danger',
			action: () => {
				props.remove()
			},
		},
	]

	////////////

	return <>
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'inkc_embed',
				'inkc_drawing-embed',
				collapsed && 'inkc_collapsed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{collapsed && (
				<div className="inkc_collapsed-bar" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
					{isEditingTitle ? (
						<input
							ref={titleInputRef}
							className="inkc_collapsed-title-input"
							defaultValue={title}
							autoFocus
							onBlur={(e) => handleTitleCommit(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleTitleCommit((e.target as HTMLInputElement).value);
								if (e.key === 'Escape') setIsEditingTitle(false);
							}}
							onPointerDown={(e) => e.stopPropagation()}
						/>
					) : (
						<span
							className="inkc_collapsed-label"
							onDoubleClick={(e) => {
								e.stopPropagation();
								setIsEditingTitle(true);
							}}
							// A double-click is impractical with a stylus, so a single tap
							// starts the rename on touch and e-ink devices.
							onClick={(e) => {
								e.stopPropagation();
								if (hasCoarsePointer()) setIsEditingTitle(true);
							}}
							title={hasCoarsePointer() ? 'Tap to rename' : 'Double-click to rename'}
						>
							{title}
						</span>
					)}
					<div className="inkc_collapsed-bar-buttons">
						<button
							className="inkc_collapse-btn"
							onPointerDown={(e) => {
								e.stopPropagation();
								openInkFile(
									props.plugin,
									props.drawingFileRef,
									props.plugin.settings.closeNoteOnFullscreen ? props.plugin.app.workspace.activeLeaf : null
								);
							}}
							onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						aria-label="Open fullscreen"
						>
							<FullscreenIcon />
						</button>
						<button
							className="inkc_collapse-btn"
							onPointerDown={(e) => { e.stopPropagation(); handleCollapsedChange(false); }}
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							aria-label="Expand embed"
						>
							<ExpandIcon />
						</button>
					</div>
				</div>
			)}

			{!collapsed && <>
				{/* Include another container so that it's height isn't affected by the padding of the outer container */}
				<div
					className = 'inkc_resize-container'
					ref = {resizeContainerElRef}
					style = {{
						width: embedWidthRef.current + 'px',
						height: embedWidthRef.current / embedAspectRatioRef.current + 'px',
						position: 'relative', // For absolute positioning inside
						left: '50%',
						translate: '-50%',
					}}
				>

					<DrawingEmbedPreviewWrapper
						plugin = {props.plugin}
						onReady = {() => {}}
						drawingFile = {props.drawingFileRef}
						onCollapseClick = {() => handleCollapsedChange(true)}
						onFullscreenClick = {() => openInkFile(
							props.plugin,
							props.drawingFileRef,
							props.plugin.settings.closeNoteOnFullscreen ? props.plugin.app.workspace.activeLeaf : null
						)}
						onClick = { async () => {
							switchToEditMode();
						}}
					/>

					<TldrawDrawingEditorWrapper
						onReady = {() => {}}
						plugin = {props.plugin}
						drawingFile = {props.drawingFileRef}
						save = {props.saveSrcFile}
						embedded
						saveControlsReference = {registerEditorControls}
						closeEditor = {saveAndSwitchToPreviewMode}
						extendedMenu = {commonExtendedOptions}
						resizeEmbed = {resizeEmbed}
					/>

				</div>
			</>}

		</div>
	</>;

	//// Helper functions
	/////////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		const maxWidth = getFullPageWidth(embedContainerElRef.current)
		if(!maxWidth) return;

		let destWidth = embedWidthRef.current + pxWidthDiff;
		if(destWidth < 350) destWidth = 350;
		if(destWidth > maxWidth) destWidth = maxWidth;

		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		if(destHeight < 150) destHeight = 150;

		embedWidthRef.current = destWidth;
		embedAspectRatioRef.current = destWidth / destHeight;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		resizeContainerElRef.current.style.height = destHeight + 'px';
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
	}

	function switchToEditMode() {
		verbose('Set DrawingEmbedState: loadingEditor')
		applyEmbedHeight();
		setEmbedState(DrawingEmbedState.loadingEditor);
	}

	async function saveAndSwitchToPreviewMode() {
		verbose('Set DrawingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		setEmbedState(DrawingEmbedState.loadingPreview);
		props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = maxWidth + 'px';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		}
	};
};


export default DrawingEmbed;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
