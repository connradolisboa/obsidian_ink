import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { applyFrameToSvg } from 'src/utils/svg-framing';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, embedStateAtom, previewActiveAtom } from '../drawing-embed';
import { getInkFileData } from 'src/utils/getInkFileData';
import { CollapseIcon } from 'src/graphics/icons/collapse-icon';
import { FullscreenIcon } from 'src/graphics/icons/fullscreen-icon';
const emptyDrawingSvg = require('../../../placeholders/empty-drawing-embed.svg');

//////////
//////////

interface DrawingEmbedPreviewProps {
    plugin: InkPlugin,
    onReady: Function,
    drawingFile: TFile,
	onClick: React.MouseEventHandler,
	onCollapseClick?: () => void,
	onFullscreenClick?: () => void,
	/** Crops the preview to this embed's saved framing. See src/utils/svg-framing.ts. */
	frame?: { x: number, y: number, w: number, h: number },
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapper: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <DrawingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const svgRef = React.useRef(null);
    // The preview's page-coordinate bounds, read from the file alongside the SVG itself.
    const previewBoundsRef = React.useRef<{ x: number, y: number, w: number, h: number } | undefined>(undefined);

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyDrawingSvg);

    React.useEffect(() => {
        //console.log('PREVIEW mounted');
        fetchFileData();
        return () => {
            //console.log('PREVIEW unmounting');
        }
    })

    // Check if src is a DataURI. If not, it's an SVG
    const isImg = fileSrc.slice(0, 4) === 'data';

    // Cropping is a string rewrite on the preview SVG, so it's memoised rather than redone on
    // every render — the SVG is the whole drawing and can be sizeable.
    const framedSrc = React.useMemo(
        () => (isImg ? fileSrc : applyFrameToSvg(fileSrc, props.frame, previewBoundsRef.current)),
        [fileSrc, isImg, props.frame?.x, props.frame?.y, props.frame?.w, props.frame?.h],
    );

	return <>
        <div
            ref = {containerElRef}
            className = {classNames([
                'inkc_drawing-embed-preview',
                props.plugin.settings.drawingFrameWhenLocked && 'inkc_visible-frame',
                props.plugin.settings.drawingBackgroundWhenLocked && 'inkc_visible-background',
            ])}
            style = {{
                position: 'absolute',
                width: '100%',
                height: '100%',
                pointerEvents: 'all',
            }}
            onClick = {(e) => { e.stopPropagation(); props.onClick(e); }}
            onMouseDown = {(e) => e.stopPropagation()}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (
                <img
                    src = {fileSrc}
                    style = {{
                        height: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad = {onLoad}
                />
            )}

            {!isImg && (
                <SVG
                    src = {framedSrc}
                    style = {{
                        // width: 'auto',
                        // height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {onLoad}
                />
            )}

            <div className="inkc_preview-buttons">
                {props.onFullscreenClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onFullscreenClick?.();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Open fullscreen"
                    >
                        <FullscreenIcon />
                    </button>
                )}
                {props.onCollapseClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onCollapseClick?.();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Collapse embed"
                    >
                        <CollapseIcon />
                    </button>
                )}
            </div>
        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        // Slight delay on transition because otherwise a flicker is sometimes seen
        setTimeout(() => {
            //console.log('--------------- SET EMBED STATE TO preview')
            setEmbedState(DrawingEmbedState.preview);
            props.onReady();
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.drawingFile)
        previewBoundsRef.current = inkFileData.meta?.previewBounds;
        if (inkFileData.previewUri) setFileSrc(inkFileData.previewUri)
    }

};



