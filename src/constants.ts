const manifest = require('../manifest.json');

////////
////////

export const PLUGIN_VERSION = manifest.version;
export const TLDRAW_VERSION = '2.4.3';
// NOTE: Everything below that ends up in a global Obsidian registry (view types,
// file extensions, codeblock languages) or in shared browser storage must stay
// distinct from the upstream Ink plugin, otherwise whichever plugin loads second
// fails to register and both can't be enabled at once. See scripts/migrate-namespace.mjs
// for the vault migration that moved existing content onto these names.
export const PLUGIN_KEY = 'inkc';
export const ATTACHMENT_SUBFOLDER_NAME = 'Ink';
export const WRITING_SUBFOLDER_NAME = 'Writing';
export const DRAWING_SUBFOLDER_NAME = 'Drawing';
export const WRITE_FILE_EXT = 'inkcwriting';
export const DRAW_FILE_EXT = 'inkcdrawing';
export const NOTEBOOK_FILE_EXT = 'inkcnotebook';
export const INK_FILE_EXTS = [WRITE_FILE_EXT, DRAW_FILE_EXT, NOTEBOOK_FILE_EXT];
export const WRITE_EMBED_KEY = 'handwritten-inkc';
export const DRAW_EMBED_KEY = 'handdrawn-inkc';
export const NOTEBOOK_EMBED_KEY = 'notebook-inkc';

// Legacy names shared with upstream Ink. Only for the migration script and for
// recognising pre-migration content — never register these.
export const LEGACY_WRITE_FILE_EXT = 'writing';
export const LEGACY_DRAW_FILE_EXT = 'drawing';
export const LEGACY_NOTEBOOK_FILE_EXT = 'notebook';
export const LEGACY_WRITE_EMBED_KEY = 'handwritten-ink';
export const LEGACY_DRAW_EMBED_KEY = 'handdrawn-ink';
export const LEGACY_NOTEBOOK_EMBED_KEY = 'notebook-ink';
export const MENUBAR_HEIGHT_PX = 100;

export const WRITE_SHORT_DELAY_MS = 500;
export const WRITE_LONG_DELAY_MS = 2000;
export const WRITE_STROKE_LIMIT = 200;

// E-reader (Boox/Onyx) tighter limits — fewer live shapes, longer SVG-export delay
// to keep the stylus hot path light and avoid mid-write SVG generation hitches.
export const WRITE_STROKE_LIMIT_EREADER = 75;
export const WRITE_LONG_DELAY_MS_EREADER = 4000;

export const DRAW_SHORT_DELAY_MS = 500;
export const DRAW_LONG_DELAY_MS = 2000;
export const DRAW_LONG_DELAY_MS_EREADER = 4000;
export const DRAW_STROKE_LIMIT = 200;

export const WRITING_PAGE_WIDTH = 2000;
export const WRITING_LINE_HEIGHT = 150;
export const WRITING_MIN_PAGE_HEIGHT = WRITING_LINE_HEIGHT * 1.5;
export const WRITING_DEFAULT_LINES_PER_PAGE = 10;
export const WRITING_DEFAULT_PAGE_HEIGHT = WRITING_LINE_HEIGHT * WRITING_DEFAULT_LINES_PER_PAGE;

export const NOTEBOOK_PAGE_WIDTH = 2000;
export const NOTEBOOK_LINE_HEIGHT = 150;
export const NOTEBOOK_DEFAULT_LINES_PER_PAGE = 10;
export const NOTEBOOK_DEFAULT_PAGE_HEIGHT = NOTEBOOK_LINE_HEIGHT * NOTEBOOK_DEFAULT_LINES_PER_PAGE;

// export const DRAWING_INITIAL_CANVAS_WIDTH = 4000;
export const DRAWING_INITIAL_WIDTH = 500;   // 750 // HACK: This sizing is a guestimation. It won't work for all themes.
export const DRAWING_INITIAL_ASPECT_RATIO = 1;
export const DRAWING_INITIAL_HEIGHT = Math.round(DRAWING_INITIAL_WIDTH * DRAWING_INITIAL_ASPECT_RATIO);