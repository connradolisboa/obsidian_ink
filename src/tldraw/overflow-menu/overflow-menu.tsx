import { Menu } from "obsidian";
import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

export interface menuOption {
    text: string,
    action: Function,
    /** Any Obsidian or Lucide icon id. */
    icon?: string,
    /** Menu items sharing a section are grouped together with a separator. */
    section?: string,
}

export const OverflowMenu: React.FC<{
    menuOptions: menuOption[]
}> = (props) => {

    // Built on demand rather than on every render — the menu only exists for as
    // long as it's open, and rebuilding it each render was throwing away a Menu
    // instance per frame while the editor was active.
    const openMenu = (e: React.MouseEvent) => {
        const menu = new Menu();

        props.menuOptions.forEach(menuOption => {
            menu.addItem((item) => {
                item.setTitle(menuOption.text);
                if (menuOption.icon) item.setIcon(menuOption.icon);
                if (menuOption.section) item.setSection(menuOption.section);
                item.onClick(() => menuOption.action());
            });
        });

        menu.showAtMouseEvent(e.nativeEvent);
    };

    return <>
        <div className="inkc_overflow-button-and-menu">
            <button
                className="inkc_btn-slim"
                onClick={openMenu}
                aria-label="More options"
            >
                <OverflowIcon />
            </button>
        </div>
    </>

};

export default OverflowMenu;
