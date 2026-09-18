import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import { ResizeDiagonalIcon } from "src/graphics/icons/resize-diagonal-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick?: Function,
	// See the note in ExtendedWritingMenu — full screen is promoted out of the overflow.
	onOpenClick?: Function,
	// Stores the current viewport as this embed's framing. Only offered when the embed can
	// actually persist it, so it stays hidden in the full-screen view.
	onSaveFrameClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onLockClick && (
                <button
                    onPointerDown = {() => props.onLockClick?.()}
                >
                    <LockIcon/>
                </button>            
            )}
            {props.onOpenClick && (
                <button
                    onPointerDown = {() => props.onOpenClick?.()}
                    aria-label = "Open full screen"
                >
                    <FullscreenIcon/>
                </button>
            )}
            {props.onSaveFrameClick && (
                <button
                    onPointerDown = {() => props.onSaveFrameClick?.()}
                    aria-label = "Save this framing"
                >
                    <ResizeDiagonalIcon/>
                </button>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;