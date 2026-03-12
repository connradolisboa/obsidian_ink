import './tldraw-writing-editor.scss';
import { Box, DefaultDashStyle, DrawShapeUtil, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteWritingTemplateShapes, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, addWritingLines, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
import { WritingContainer, WritingContainerUtil } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from '../extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLines, WritingLinesUtil } from '../writing-shapes/writing-lines';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import {getAssetUrlsByImport} from '@tldraw/assets/imports';
import { editorActiveAtom, WritingEmbedState, embedStateAtom } from './writing-embed';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/utils/getInkFileData';
import { verbose } from 'src/utils/log-to-console';
import { isEreader } from 'src/utils/isEreader';
import { EreaderDrawShapeUtil, setEreaderStreamline } from '../ereader-draw-shape-util';
import { SecondaryMenuBar } from '../secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from '../modify-menu/modify-menu';
import { ScrollButtons } from '../scroll-buttons/scroll-buttons';
import { PageNavigation } from '../page-navigation/page-navigation';
import { WRITING_DEFAULT_PAGE_HEIGHT } from 'src/constants';
import { createWritingPage, detectPageOverflow, getCurrentPageIndex, getPageCount, initializePagesMode, navigateToPage } from 'src/utils/writing-pages';

///////
///////

interface TldrawWritingEditorProps {
	onResize?: Function,
	plugin: InkPlugin,
	writingFile: TFile,
	save: (inkFileData: InkFileData) => void,
	extendedMenu?: any[],

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,

	// For fullscreen focus mode
	onExitFocusMode?: () => void,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawWritingEditorWrapper: React.FC<TldrawWritingEditorProps> = (props) => {
    const editorActive = useAtomValue(editorActiveAtom);

    if(editorActive) {
        return <TldrawWritingEditor {...props} />
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

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {

	const useEreaderRenderer = !props.plugin.settings.writingDynamicStrokeThickness || isEreader();
	const shapeUtils = React.useMemo(() => getShapeUtils(useEreaderRenderer), [useEreaderRenderer]);

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const setEmbedState = useSetAtom(embedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		fetchFileData();
		return () => {
			verbose('EDITOR unmounting');
		}
	}, [])

	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	////////

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		SelectionBackground: TldrawSelectionBackground,
		Handles: TldrawHandles,
	}

	const isPageMode = props.plugin.settings.writingPageMode === 'pages';
	const linesPerPage = props.plugin.settings.writingLinesPerPage;
	const pageHeight = linesPerPage * WRITING_LINE_HEIGHT;

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		setEmbedState(WritingEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);

		const ereader = isEreader();
		const stylusOnly = props.plugin.settings.stylusOnlyInput || ereader;
		const fingerSwipeScroll = props.plugin.settings.fingerSwipeScroll;
		preventTldrawCanvasesCausingObsidianGestures(editor, { stylusOnly, fingerSwipeScroll });

		setEreaderStreamline(props.plugin.settings.writingStreamline);

		// Use simple constant-width strokes instead of perfect-freehand smoothing
		const useSimpleStrokes = !props.plugin.settings.writingDynamicStrokeThickness || ereader;
		if (useSimpleStrokes) {
			editor.setStyleForNextShapes(DefaultDashStyle, 'solid');
		}

		// Apply e-reader CSS optimizations (disable animations/transitions)
		if (ereader && editorWrapperRefEl.current) {
			editorWrapperRefEl.current.classList.add('ddc_ink_ereader-mode');
		}

		resizeContainerIfEmbed(tlEditorRef.current);

		updateWritingStoreIfNeeded(editor);

		// Initialize pages mode if enabled
		if (isPageMode) {
			initializePagesMode(editor, linesPerPage);
		}

		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		if (!isPageMode) {
			resizeWritingTemplateInvitingly(editor);
		}
		resizeContainerIfEmbed(editor);	// Has an effect if the embed is new and started at 0

		// view set up
		if(props.embedded) {
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
		}

		// Show editor only after camera is initialized to prevent drawing with wrong coordinates
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		// Re-init camera after layout settles to ensure correct dimensions
		requestAnimationFrame(() => {
			if(props.embedded) {
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			} else {
				initWritingCamera(editor, MENUBAR_HEIGHT_PX);
				cameraLimitsRef.current = initWritingCameraLimits(editor);
			}
		});

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
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
					// In pages mode, auto-create next page on overflow
					if (isPageMode && detectPageOverflow(editor, pageHeight)) {
						const pageCount = getPageCount(editor);
						createWritingPage(editor, pageCount, linesPerPage);
						navigateToPage(editor, pageCount, props.embedded ? 0 : MENUBAR_HEIGHT_PX);
					}
					break;
					
				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(editor);
					break;
					
				default:
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// queueOrRunStorePostProcesses(editor);
					verbose('Activity not recognised.');
					verbose(['entry', entry], {freeze: true});
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				// save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
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

			// Re-init camera after container resize to prevent coordinate distortion
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

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		if(!isPageMode && !props.plugin.settings.writingManualLineAdd) {
			resizeWritingTemplateInvitingly(editor);
			resizeContainerIfEmbed(editor);
		}
		// entry && simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();

		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
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
		verbose('incrementalSave');
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
		verbose('completeSave');
		let previewUri;

		unstashStaleContent(editor);

		// In pages mode, switch to page 1 for preview generation, then switch back
		const currentPageId = editor.getCurrentPageId();
		const pages = editor.getPages();
		if (isPageMode && pages.length > 1) {
			silentlyChangeStore(editor, () => {
				editor.setCurrentPage(pages[0].id);
			});
		}

		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor);

		// Switch back to the original page
		if (isPageMode && pages.length > 1) {
			silentlyChangeStore(editor, () => {
				editor.setCurrentPage(currentPageId);
			});
		}

		stashStaleContent(editor);
		
		if (svgObj) {
			previewUri = svgObj.svg;//await svgToPngDataUri(svgObj)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if(previewUri) {
			const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
				previewUri,
			})
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
			const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
			})
			props.save(pageData);
		}

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	const handleAddLines = (e: React.PointerEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const editor = tlEditorRef.current;
		if (!editor) return;
		addWritingLines(editor, 2);
		resizeContainerIfEmbed(editor);
	};

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_writing-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
				opacity: 0, // So it's invisible while it loads
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {shapeUtils}
				tools = {[...defaultTools, ...defaultShapeTools]}
				initialState = "draw"
				snapshot = {tlEditorSnapshot}
				// persistenceKey = {props.fileRef.path}

				// bindingUtils = {defaultBindingUtils}
				components = {defaultComponents}

				onMount = {handleMount}

				// Prevent autoFocussing so it can be handled in the handleMount
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
							// REVIEW: Save immediately? incase it hasn't been saved yet
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {props.extendedMenu}
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
						{/* Fullscreen exit — Material Symbols Rounded */}
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
				{!isPageMode && props.plugin.settings.writingManualLineAdd && (
					<button
						className="ink_add-lines-button"
						onPointerDown={handleAddLines}
						aria-label="Add 5 lines"
					>
						<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
							<path d="M440-440H200q-17 0-28.5-11.5T160-480q0-17 11.5-28.5T200-520h240v-240q0-17 11.5-28.5T480-800q17 0 28.5 11.5T520-760v240h240q17 0 28.5 11.5T800-480q0 17-11.5 28.5T760-440H520v240q0 17-11.5 28.5T480-160q-17 0-28.5-11.5T440-200v-240Z" />
						</svg>
					</button>
				)}
				{isPageMode && (
					<PageNavigation
						getTlEditor = {getTlEditor}
						linesPerPage = {linesPerPage}
						topMarginPx = {props.embedded ? 0 : MENUBAR_HEIGHT_PX}
						onPageChange = {() => {
							const editor = tlEditorRef.current;
							if (editor) {
								unstashStaleContent(editor);
								resizeContainerIfEmbed(editor);
							}
						}}
					/>
				)}
				{!isPageMode && props.embedded && props.plugin.settings.showScrollButtons && <ScrollButtons />}
				{!isPageMode && !props.embedded && props.plugin.settings.showScrollButtons && <ScrollButtons getTlEditor={getTlEditor} />}
			</SecondaryMenuBar>
			
		</div>
	</>;


	// Helper functions
	///////////////////

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.writingFile)
        if(inkFileData.tldraw) {
            const snapshot = prepareWritingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }

};



