import "./notebook-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawNotebookEditorWrapper } from "./tldraw-notebook-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { rememberWritingFile } from "src/utils/rememberDrawingFile";
import { NotebookEmbedPreviewWrapper } from "./notebook-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { NotebookEmbedData } from "src/utils/embed";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { verbose } from "src/utils/log-to-console";
import { CollapseIcon } from "src/graphics/icons/collapse-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { hasCoarsePointer } from "src/utils/device-classes";

///////
///////


export enum NotebookEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const notebookEmbedStateAtom = atom(NotebookEmbedState.preview)
export const notebookPreviewActiveAtom = atom<boolean>((get) => {
	const embedState = get(notebookEmbedStateAtom);
	return embedState !== NotebookEmbedState.editor
})
export const notebookEditorActiveAtom = atom<boolean>((get) => {
	const embedState = get(notebookEmbedStateAtom);
	return embedState !== NotebookEmbedState.preview
})

///////

export type NotebookEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function NotebookEmbed (props: {
	plugin: InkPlugin,
	notebookFileRef: TFile,
	pageData: InkFileData,
	embedData?: NotebookEmbedData,
	save: (pageData: InkFileData) => void,
	remove: Function,
	onCollapsedChange?: (collapsed: boolean) => void,
	onTitleChange?: (title: string) => void,
	onPageChange?: (pageIndex: number) => void,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<NotebookEditorControls>();

	const setEmbedState = useSetAtom(notebookEmbedStateAtom);
	const [collapsed, setCollapsed] = useState(props.embedData?.collapsed ?? false);
	const [title, setTitle] = useState(props.notebookFileRef.basename);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [currentPage, setCurrentPage] = useState(props.embedData?.currentPage ?? 0);

	function handleCollapsedChange(value: boolean) {
		setCollapsed(value);
		props.onCollapsedChange?.(value);
	}

	function handleTitleCommit(newTitle: string) {
		const trimmed = newTitle.trim() || props.notebookFileRef.basename;
		setTitle(trimmed);
		setIsEditingTitle(false);
		props.onTitleChange?.(trimmed);
	}

	function handlePageChange(pageIndex: number) {
		setCurrentPage(pageIndex);
		props.onPageChange?.(pageIndex);
	}

	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			setTimeout( () => {
				switchToEditMode();
			},200);
		}
	}, [])

	const commonExtendedOptions = [
		{
			text: 'Copy notebook',
			icon: 'copy',
			section: 'inkc-file',
			action: async () => {
				await rememberWritingFile(props.plugin, props.notebookFileRef);
			}
		},
		{
			text: 'Open notebook',
			icon: 'maximize',
			section: 'inkc-file',
			action: async () => {
				openInkFile(props.plugin, props.notebookFileRef)
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
				'inkc_notebook-embed',
				collapsed && 'inkc_collapsed',
			])}
			style = {{
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
									props.notebookFileRef,
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
				<div
					className = 'inkc_resize-container'
					ref = {resizeContainerElRef}
				>

					<NotebookEmbedPreviewWrapper
						plugin = {props.plugin}
						onResize = {(height: number) => resizeContainer(height)}
						notebookFile = {props.notebookFileRef}
						onCollapseClick = {() => handleCollapsedChange(true)}
						onFullscreenClick = {() => openInkFile(
							props.plugin,
							props.notebookFileRef,
							props.plugin.settings.closeNoteOnFullscreen ? props.plugin.app.workspace.activeLeaf : null
						)}
						onClick = {async (event) => {
							switchToEditMode();
						}}
						currentPage = {currentPage}
						onPageChange = {handlePageChange}
					/>

					<TldrawNotebookEditorWrapper
						plugin = {props.plugin}
						onResize = {(height: number) => resizeContainer(height)}
						notebookFile = {props.notebookFileRef}
						save = {props.save}
						embedded
						initialPage = {currentPage}
						saveControlsReference = {registerEditorControls}
						closeEditor = {saveAndSwitchToPreviewMode}
						extendedMenu = {commonExtendedOptions}
						onPageChange = {handlePageChange}
					/>

				</div>
			</>}

		</div>
	</>;

	// Helper functions
	///////////////////

	function registerEditorControls(handlers: NotebookEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeContainer(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		setTimeout( () => {
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('inkc_smooth-transition');
		}, 100)
	}

	function switchToEditMode() {
		verbose('Set NotebookEmbedState: loadingEditor')
		setEmbedState(NotebookEmbedState.loadingEditor);
	}

	async function saveAndSwitchToPreviewMode() {
		verbose('Set NotebookEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		setEmbedState(NotebookEmbedState.loadingPreview);
	}

};

export default NotebookEmbed;
