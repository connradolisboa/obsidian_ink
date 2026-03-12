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
    const setEmbedState = useSetAtom(notebookEmbedStateAtom);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyWritingSvg);

    React.useEffect(() => {
        fetchFileData();
        return () => {}
    })

    const isImg = fileSrc.slice(0, 4) === 'data';

    return <>
        <div
            ref={containerElRef}
            className={classNames([
                'ddc_ink_writing-embed-preview',
                props.plugin.settings.notebookLinesWhenLocked && 'ddc_ink_visible-lines',
                props.plugin.settings.notebookBackgroundWhenLocked && 'ddc_ink_visible-background',
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

            <div className="ddc_ink_preview-buttons">
                {props.onFullscreenClick && (
                    <button
                        className="ddc_ink_collapse-btn"
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
                        className="ddc_ink_collapse-btn"
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

        </div>
    </>;

    function onLoad() {
        recalcHeight();
        setTimeout(() => {
            setEmbedState(NotebookEmbedState.preview);
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.notebookFile)
        if (inkFileData.previewUri) setFileSrc(inkFileData.previewUri)
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
