import "./drawing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { Editor } from "@tldraw/tldraw";
import { silentlyChangeStore } from "src/utils/tldraw-helpers";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import { HandIcon } from "src/graphics/icons/hand-icon";
import classNames from "classnames";

//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
	hand = 'hand',
}
interface DrawingMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
    embedded?: boolean,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);

    ///////////

    function undo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
		props.onStoreChange(editor)
	}
	function redo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
		props.onStoreChange(editor)

	}
	function lockCameraIfEmbedded(editor: Editor) {
		if (props.embedded) {
			editor.setCameraOptions({ isLocked: true });
		}
	}
	function activateSelectTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		lockCameraIfEmbedded(editor);
		editor.setCurrentTool('select');
		setCurTool(tool.select);
	}
	function activateDrawTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		lockCameraIfEmbedded(editor);
		editor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		lockCameraIfEmbedded(editor);
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
	}
	function activateHandTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		// Unlock camera so hand tool can pan
		if (props.embedded) {
			editor.setCameraOptions({ isLocked: false });
		}
		editor.setCurrentTool('hand');
		setCurTool(tool.hand);
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_full',
            ])}
        >
            {/* <div
                className='ink_quick-menu'
            >
                <button
                    onPointerDown={undo}
                    disabled={!canUndo}
                >
                    <UndoIcon/>
                </button>
                <button
                    onPointerDown={redo}
                    disabled={!canRedo}
                >
                    <RedoIcon/>
                </button>
            </div> */}
            <div
                className='ink_tool-menu'
            >
                <button
                    onPointerDown={activateSelectTool}
                    disabled={curTool === tool.select}
                >
                    <SelectIcon/>
                </button>
                <button
                    onPointerDown={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <DrawIcon/>
                </button>
                <button
                    onPointerDown={activateEraseTool}
                    disabled={curTool === tool.eraser}
                >
                    <EraseIcon/>
                </button>
                <button
                    onPointerDown={activateHandTool}
                    disabled={curTool === tool.hand}
                >
                    <HandIcon/>
                </button>
            </div>
            <div
                className='ink_other-menu'
            >
                
            </div>
        </div>
    </>;

});

export default DrawingMenu;