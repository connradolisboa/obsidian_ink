import './tldraw-notebook-editor.scss';
import { Box, DefaultDashStyle, DrawShapeUtil, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteWritingTemplateShapes, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, addWritingLines, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
import { WritingContainer, WritingContainerUtil } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, NOTEBOOK_LINE_HEIGHT, NOTEBOOK_PAGE_WIDTH } from 'src/constants';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from '../extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLines, WritingLinesUtil } from '../writing-shapes/writing-lines';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import {getAssetUrlsByImport} from '@tldraw/assets/imports';
import { NotebookEmbedState, notebookEmbedStateAtom, notebookEditorActiveAtom } from './notebook-embed';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/utils/getInkFileData';
import { verbose } from 'src/utils/log-to-console';
import { isEreader } from 'src/utils/isEreader';
import { EreaderDrawShapeUtil, setEreaderStreamline } from '../ereader-draw-shape-util';
import { SecondaryMenuBar } from '../secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from '../modify-menu/modify-menu';
import { PageNavigation } from '../page-navigation/page-navigation';
import { createWritingPage, deleteWritingPage, detectPageOverflow, getCurrentPageIndex, getPageCount, navigateToPage } from 'src/utils/writing-pages';

///////
///////

interface TldrawNotebookEditorProps {
	onResize?: Function,
	plugin: InkPlugin,
	notebookFile: TFile,
	save: (inkFileData: InkFileData) => void,
	extendedMenu?: any[],
	initialPage?: number,

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
	onPageChange?: (pageIndex: number) => void,

	// For fullscreen focus mode
	onExitFocusMode?: () => void,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawNotebookEditorWrapper: React.FC<TldrawNotebookEditorProps> = (props) => {
    const editorActive = useAtomValue(notebookEditorActiveAtom);

    if(editorActive) {
        return <TldrawNotebookEditor {...props} />
    } else {
        return <></>
    }
}

const myOverrides: TLUiOverrides = {}
const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0,
}

function getShapeUtils(useEreaderRenderer: boolean) {
	const baseUtils = useEreaderRenderer
		? [...defaultShapeUtils.filter(u => u !== DrawShapeUtil), EreaderDrawShapeUtil]
		: [...defaultShapeUtils];
	return [...baseUtils, WritingContainerUtil, WritingLinesUtil];
}

export function TldrawNotebookEditor(props: TldrawNotebookEditorProps) {

	const useEreaderRenderer = !props.plugin.settings.writingDynamicStrokeThickness || isEreader();
	const shapeUtils = React.useMemo(() => getShapeUtils(useEreaderRenderer), [useEreaderRenderer]);

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const setEmbedState = useSetAtom(notebookEmbedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const [mountedEditor, setMountedEditor] = React.useState<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

	const linesPerPage = props.plugin.settings.notebookLinesPerPage;
	const pageHeight = linesPerPage * NOTEBOOK_LINE_HEIGHT;

	// On mount
	React.useEffect( ()=> {
		verbose('NOTEBOOK EDITOR mounted');
		fetchFileData();
		return () => {
			verbose('NOTEBOOK EDITOR unmounting');
		}
	}, [])

	if(!tlEditorSnapshot) return <></>
	verbose('NOTEBOOK EDITOR snapshot loaded')

	////////

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		SelectionBackground: TldrawSelectionBackground,
		Handles: TldrawHandles,
	}

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		setMountedEditor(editor);
		setEmbedState(NotebookEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);

		// Navigate to persisted page if specified
		if (props.initialPage !== undefined && props.initialPage > 0) {
			const pageCount = getPageCount(editor);
			if (props.initialPage < pageCount) {
				navigateToPage(editor, props.initialPage, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
			}
		}

		const ereader = isEreader();
		const stylusOnly = props.plugin.settings.stylusOnlyInput || ereader;
		const fingerSwipeScroll = props.plugin.settings.fingerSwipeScroll;
		preventTldrawCanvasesCausingObsidianGestures(editor, { stylusOnly, fingerSwipeScroll });

		setEreaderStreamline(props.plugin.settings.writingStreamline);

		const useSimpleStrokes = !props.plugin.settings.writingDynamicStrokeThickness || ereader;
		if (useSimpleStrokes) {
			editor.setStyleForNextShapes(DefaultDashStyle, 'solid');
		}

		if (ereader && editorWrapperRefEl.current) {
			editorWrapperRefEl.current.classList.add('ddc_ink_ereader-mode');
		}

		resizeContainerIfEmbed(tlEditorRef.current);

		// Notebook pages don't need updateWritingStoreIfNeeded — shapes are created per-page
		adaptTldrawToObsidianThemeMode(editor);
		resizeContainerIfEmbed(editor);

		// Camera setup
		if(props.embedded) {
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
		}

		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		// Re-init camera after layout settles
		requestAnimationFrame(() => {
			if(props.embedded) {
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			} else {
				initWritingCamera(editor, MENUBAR_HEIGHT_PX);
				cameraLimitsRef.current = initWritingCameraLimits(editor);
			}
		});

		const removeUserActionListener = editor.store.listen((entry) => {
			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					if(cameraLimitsRef.current) restrictWritingCamera(editor, cameraLimitsRef.current);
					unstashStaleContent(editor);
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(editor);
					break;

				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(editor);
					// Auto-create next page on overflow
					if (detectPageOverflow(editor, pageHeight)) {
						const pageCount = getPageCount(editor);
						createWritingPage(editor, pageCount, linesPerPage);
						navigateToPage(editor, pageCount, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
					}
					break;

				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(editor);
					break;

				default:
					verbose('Activity not recognised.');
					verbose(['entry', entry], {freeze: true});
			}

		}, {
			source: 'user',
			scope: 'all'
		})

		const unmountActions = () => {
			resetInputPostProcessTimers();
			removeUserActionListener();
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor);
					unmountActions();
				},
				resize: () => {
					const camera = editor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(editor);
					editor.setCamera({x: camera.x, y: cameraY})
				}
			})
		}

		return () => {
			unmountActions();
		};
	}

	///////////////

	function resizeContainerIfEmbed (editor: Editor) {
		if (!props.embedded || !props.onResize) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getWritingContainerBounds(editor);

		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			props.onResize(newEmbedHeight);

			requestAnimationFrame(() => {
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			});
		}

	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	const instantInputPostProcess = (editor: Editor) => {
		// Notebook pages have fixed height — no template resizing needed
		resizeContainerIfEmbed(editor);
	};

	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();
		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)
	};

	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();
		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			WRITE_LONG_DELAY_MS
		)
	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	const incrementalSave = async (editor: Editor) => {
		verbose('notebook incrementalSave');
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

		const pageData = buildWritingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('notebook completeSave');

		unstashStaleContent(editor);

		const currentPageId = editor.getCurrentPageId();
		const pages = editor.getPages();
		const pagePreviewUris: string[] = [];

		// Generate preview for each page
		for (let i = 0; i < pages.length; i++) {
			silentlyChangeStore(editor, () => {
				editor.setCurrentPage(pages[i].id);
			});
			const svgObj = await getWritingSvg(editor);
			pagePreviewUris.push(svgObj?.svg ?? '');
		}

		// Restore current page
		silentlyChangeStore(editor, () => {
			editor.setCurrentPage(currentPageId);
		});

		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

		// Use first page as the main preview for backwards compat
		const previewUri = pagePreviewUris[0] || undefined;

		const pageData = buildWritingFileData({
			tlEditorSnapshot,
			previewUri,
			pagePreviewUris: pagePreviewUris.length > 1 ? pagePreviewUris : undefined,
		});
		props.save(pageData);

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_notebook-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
				opacity: 0,
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {shapeUtils}
				tools = {[...defaultTools, ...defaultShapeTools]}
				initialState = "draw"
				snapshot = {tlEditorSnapshot}

				components = {defaultComponents}

				onMount = {handleMount}

				autoFocus = {false}
			/>

			<PrimaryMenuBar>
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {[
							...(props.extendedMenu || []),
							{
								text: 'Delete page',
								action: () => {
									const editor = tlEditorRef.current;
									if (!editor) return;
									const pageCount = getPageCount(editor);
									if (pageCount <= 1) return;
									const currentIndex = getCurrentPageIndex(editor);
									deleteWritingPage(editor, currentIndex, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
									queueOrRunStorePostProcesses(editor);
									props.onPageChange?.(getCurrentPageIndex(editor));
								},
							},
						]}
					/>
				)}
				{!props.embedded && props.onExitFocusMode && (
					<button
						className="ink_exit-focus-mode-button"
						onPointerDown={(e) => {
							e.preventDefault();
							e.stopPropagation();
							props.onExitFocusMode!();
						}}
						aria-label="Exit focus mode"
					>
						<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
							<path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" />
						</svg>
					</button>
				)}
			</PrimaryMenuBar>

			<SecondaryMenuBar>
				<ModifyMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				<PageNavigation
					editor = {mountedEditor}
					linesPerPage = {linesPerPage}
					topMarginPx = {props.embedded ? 0 : MENUBAR_HEIGHT_PX}
					onPageChange = {(pageIndex: number) => {
						const editor = tlEditorRef.current;
						if (editor) {
							unstashStaleContent(editor);
							resizeContainerIfEmbed(editor);
						}
						props.onPageChange?.(pageIndex);
					}}
				/>
			</SecondaryMenuBar>

		</div>
	</>;


	// Helper functions
	///////////////////

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.notebookFile)
        if(inkFileData.tldraw) {
            const snapshot = prepareWritingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }

};
