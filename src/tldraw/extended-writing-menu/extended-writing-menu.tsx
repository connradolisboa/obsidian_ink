import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-writing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import { FullscreenIcon } from "src/graphics/icons/fullscreen-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";

//////////
//////////

export const ExtendedWritingMenu: React.FC<{
	onLockClick: Function,
	// Opening the file full screen is the most-reached-for action in an embed, so it gets its own
	// button rather than living behind the overflow. On e-ink especially, every nested tap costs a
	// full screen refresh — flattening one level is a real latency win, not just tidier.
	onOpenClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            <button
                onPointerDown = {() => props.onLockClick()}
            >
                <LockIcon/>
            </button>
            {props.onOpenClick && (
                <button
                    onPointerDown = {() => props.onOpenClick?.()}
                    aria-label = "Open full screen"
                >
                    <FullscreenIcon/>
                </button>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedWritingMenu;