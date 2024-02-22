import { keymap } from "@codemirror/view";
//import { EditorSelection, EditorState } from "@codemirror/state"
import { indentLess, indentMore } from "@codemirror/commands";
/* -------------------------------- FROM SAM -------------------------------- */
import {
    foldAll,
    unfoldAll,
    unfoldCode,
    foldCode,
    toggleFold
} from "@codemirror/language";
/* -------------------------------------------------------------------------- */
import {
    insertNewBlockAtCursor,
    addNewBlockBeforeCurrent,
    addNewBlockAfterCurrent,
    addNewBlockBeforeFirst,
    addNewBlockAfterLast,
    moveLineUp,
    moveLineDown,
    selectAll,
    gotoPreviousBlock,
    gotoNextBlock,
    selectNextBlock,
    selectPreviousBlock,
    gotoPreviousParagraph,
    gotoNextParagraph,
    selectNextParagraph,
    selectPreviousParagraph,
    newCursorBelow,
    newCursorAbove
} from "./block/commands.js";
import { pasteCommand, copyCommand, cutCommand } from "./copy-paste.js";

import { formatBlockContent } from "./block/format-code.js";
import { deleteLine } from "./block/delete-line.js";

export function keymapFromSpec(specs) {
    return keymap.of(
        specs.map(spec => {
            if (spec.run) {
                if ("preventDefault" in spec) {
                    return spec;
                } else {
                    return { ...spec, preventDefault: true };
                }
            } else {
                const [key, run] = spec;
                return {
                    key,
                    run,
                    preventDefault: true
                };
            }
        })
    );
}

export function heynoteKeymap(editor) {
    return keymapFromSpec([
        ["Mod-c", copyCommand(editor)],
        ["Mod-v", pasteCommand],
        ["Mod-x", cutCommand(editor)],
        ["Tab", indentMore],
        ["Shift-Tab", indentLess],
        ["Alt-Shift-Enter", addNewBlockBeforeFirst],
        ["Mod-Shift-Enter", addNewBlockAfterLast],
        ["Alt-Enter", addNewBlockBeforeCurrent],
        ["Mod-Enter", addNewBlockAfterCurrent],
        ["Mod-Alt-Enter", insertNewBlockAtCursor],
        ["Mod-a", selectAll],
        ["Mod-[", foldCode],
        ["Mod-]", unfoldCode],
        ["Mod-Shift-,", foldAll],
        ["Mod-Shift-.", unfoldAll],
        ["Alt-ArrowUp", moveLineUp],
        ["Alt-ArrowDown", moveLineDown],
        ["Mod-l", () => editor.openLanguageSelector()],
        ["Alt-Shift-f", formatBlockContent],
        ["Mod-Alt-ArrowDown", newCursorBelow],
        ["Mod-Alt-ArrowUp", newCursorAbove],
        ["Mod-Shift-k", deleteLine],
        {
            key: "Mod-ArrowUp",
            run: gotoPreviousBlock,
            shift: selectPreviousBlock
        },
        { key: "Mod-ArrowDown", run: gotoNextBlock, shift: selectNextBlock },
        {
            key: "Ctrl-ArrowUp",
            run: gotoPreviousParagraph,
            shift: selectPreviousParagraph
        },
        {
            key: "Ctrl-ArrowDown",
            run: gotoNextParagraph,
            shift: selectNextParagraph
        }
        /* ---------------------------- FROM SAM ---------------------------- */
        // {
        //     key: "Mod-[",
        //     run: foldCode
        // },
        // {
        //     key: "Mod-]",
        //     run: unfoldCode
        // },
        // {
        //     key: "Mod-Shift-,",
        //     run: foldAll
        // },
        // {
        //     key: "Mod-Shift-.",
        //     run: unfoldAll
        // },
        // {
        //     key: "Mod-k",
        //     run: insertLink
        // }
        /* ------------------------------------------------------------------ */
    ]);
}
