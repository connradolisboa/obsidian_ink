import classNames from 'classnames';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import InkPlugin from 'src/main';
import { useAtomValue, useSetAtom } from 'jotai';
import { NotebookEmbedState, notebookEmbedStateAtom, notebookPreviewActiveAtom } from './notebook-embed';
import { TFile } from 'obsidian';
import { getInkFileData } from 'src/utils/getInkFileData';
import { CollapseIcon } from 'src/graphics/icons/collapse-icon';
import { FullscreenIcon } from 'src/graphics/icons/fullscreen-icon';
const emptyWritingSvg = require('../../placeholders/empty-writing-embed.svg');

//////////
//////////

interface NotebookEmbedPreviewProps {
    plugin: InkPlugin,
    onResize: Function,
    notebookFile: TFile,
    onClick: React.MouseEventHandler,
    onCollapseClick?: () => void,
    onFullscreenClick?: () => void,
    currentPage?: number,
    onPageChange?: (pageIndex: number) => void,
}

export const NotebookEmbedPreviewWrapper: React.FC<NotebookEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(notebookPreviewActiveAtom);

    if (previewActive) {
        return <NotebookEmbedPreview {...props} />
    } else {
        return <></>
    }
}

const NotebookEmbedPreview: React.FC<NotebookEmbedPreviewProps> = (props) => {
    const containerElRef = React.useRef<HTMLDivElement>(null);
    const onLoadTimeoutRef = React.useRef<NodeJS.Timeout>();
    const setEmbedState = useSetAtom(notebookEmbedStateAtom);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyWritingSvg);
    const [totalPages, setTotalPages] = React.useState(1);

    React.useEffect(() => {
        fetchFileData();
        return () => {
            if (onLoadTimeoutRef.current) clearTimeout(onLoadTimeoutRef.current);
        }
    })

    const currentPage = props.currentPage ?? 0;
    const isImg = fileSrc.slice(0, 4) === 'data';

    function handlePrevPage(e: React.PointerEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (currentPage > 0) {
            props.onPageChange?.(currentPage - 1);
        }
    }

    function handleNextPage(e: React.PointerEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (currentPage < totalPages - 1) {
            props.onPageChange?.(currentPage + 1);
        }
    }

    return <>
        <div
            ref={containerElRef}
            className={classNames([
                'inkc_writing-embed-preview',
                props.plugin.settings.notebookLinesWhenLocked && 'inkc_visible-lines',
                props.plugin.settings.notebookBackgroundWhenLocked && 'inkc_visible-background',
            ])}
            style={{
                position: 'absolute',
                width: '100%',
            }}
            onClick={props.onClick}
        >
            {isImg && (<>
                <img
                    src={fileSrc}
                    style={{
                        width: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad={onLoad}
                />
            </>)}

            {!isImg && (<>
                <SVG
                    src={fileSrc}
                    style={{
                        width: '100%',
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents="visible"
                    onLoad={onLoad}
                />
            </>)}

            <div className="inkc_preview-buttons">
                {props.onFullscreenClick && (
                    <button
                        className="inkc_collapse-btn"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            props.onFullscreenClick?.();
                        }}
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
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Collapse embed"
                    >
                        <CollapseIcon />
                    </button>
                )}
            </div>

            {totalPages > 1 && (
                <div
                    className="inkc_preview-page-nav"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="ink_page-nav-button"
                        onPointerDown={handlePrevPage}
                        disabled={currentPage === 0}
                        aria-label="Previous page"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height={18} viewBox="0 -960 960 960" width={18}>
                            <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
                        </svg>
                    </button>
                    <span className="ink_page-indicator">
                        {currentPage + 1} / {totalPages}
                    </span>
                    <button
                        className="ink_page-nav-button"
                        onPointerDown={handleNextPage}
                        disabled={currentPage === totalPages - 1}
                        aria-label="Next page"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" height={18} viewBox="0 -960 960 960" width={18}>
                            <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
                        </svg>
                    </button>
                </div>
            )}

        </div>
    </>;

    function onLoad() {
        recalcHeight();
        onLoadTimeoutRef.current = setTimeout(() => {
            setEmbedState(NotebookEmbedState.preview);
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.notebookFile)

        // Use per-page preview if available, otherwise fall back to main preview
        if (inkFileData.pagePreviewUris && inkFileData.pagePreviewUris.length > 0) {
            setTotalPages(inkFileData.pagePreviewUris.length);
            const pageIdx = Math.min(currentPage, inkFileData.pagePreviewUris.length - 1);
            const uri = inkFileData.pagePreviewUris[pageIdx];
            if (uri) setFileSrc(uri);
        } else if (inkFileData.previewUri) {
            setTotalPages(1);
            setFileSrc(inkFileData.previewUri);
        }
    }

    function recalcHeight() {
        if (!containerElRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.target !== containerElRef.current) return;
                if (!entry.isIntersecting) return;

                const rect = containerElRef.current.getBoundingClientRect();
                props.onResize(rect.height);
                observer.unobserve(containerElRef.current);
            });
        });
        observer.observe(containerElRef.current);
    }

};
