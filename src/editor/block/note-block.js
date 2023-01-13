import { ViewPlugin, EditorView, Decoration, WidgetType, lineNumbers } from "@codemirror/view"
import { layer, RectangleMarker } from "@codemirror/view"
import { EditorState, RangeSetBuilder, StateField, Facet , StateEffect} from "@codemirror/state";
import { RangeSet } from "@codemirror/rangeset";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language"
import { Note, Document, NoteDelimiter } from "../lang-heynote/parser.terms.js"
import { IterMode } from "@lezer/common";
import { heynoteEvent, LANGUAGE_CHANGE } from "../annotation.js";


// tracks the size of the first delimiter
let firstBlockDelimiterSize

function getBlocks(state) {
    const blocks = [];
    
    ensureSyntaxTree(state, state.doc.length).iterate({
        enter: (type) => {
            if (type.type.id == Document || type.type.id == Note) {
                return true
            } else if (type.type.id === NoteDelimiter) {
                const langNode = type.node.getChild("NoteLanguage")
                const language = state.doc.sliceString(langNode.from, langNode.to)
                const isAuto = !!type.node.getChild("Auto")
                const contentNode = type.node.nextSibling
                blocks.push({
                    language: {
                        name: language,
                        auto: isAuto,
                    },
                    content: {
                        from: contentNode.from,
                        to: contentNode.to,
                    },
                    delimiter: {
                        from: type.from,
                        to: type.to,
                    },
                })
                return false;
            }
            return false;
        },
        mode: IterMode.IgnoreMounts,
    });
    firstBlockDelimiterSize = blocks[0]?.delimiter.to
    return blocks
}

export const blockState = StateField.define({
    create(state) {
        return getBlocks(state);
    },
    update(blocks, transaction) {
        //console.log("blocks", blocks)
        if (transaction.docChanged) {
            //console.log("updating block state", transaction)
            return getBlocks(transaction.state);
        }
        //return widgets.map(transaction.changes);
        return blocks
    },
})

export function getActiveNoteBlock(state) {
    // find which block the cursor is in
    const range = state.selection.asSingle().ranges[0]
    return state.facet(blockState).find(block => block.content.from <= range.from && block.content.to >= range.from)
}


class NoteBlockStart extends WidgetType {
    constructor(isFirst) {
        super()
        this.isFirst = isFirst
    }
    eq(other) {
        //return other.checked == this.checked
        return true
    }
    toDOM() {
        let wrap = document.createElement("div")
        wrap.className = "block-start" + (this.isFirst ? " first" : "")
        //wrap.innerHTML = "<br>"
        return wrap
    }
    ignoreEvent() {
        return false
    }
}
const noteBlockWidget = () => {
    const decorate = (state) => {
        const widgets = [];

        state.facet(blockState).forEach(block => {
            let delimiter = block.delimiter
            let deco = Decoration.replace({
                widget: new NoteBlockStart(delimiter.from === 0 ? true : false),
                inclusive: true,
                block: true,
                side: 0,
            });
            //console.log("deco range:", delimiter.from === 0 ? delimiter.from : delimiter.from+1,delimiter.to-1)
            widgets.push(deco.range(
                delimiter.from === 0 ? delimiter.from : delimiter.from + 1,
                delimiter.to - 1,
            ));
        });

        return widgets.length > 0 ? RangeSet.of(widgets) : Decoration.none;
    };

    const noteBlockStartField = StateField.define({
        create(state) {
            return decorate(state);
        },
        update(widgets, transaction) {
            if (transaction.docChanged) {
                return decorate(transaction.state);
            }

            //return widgets.map(transaction.changes);
            return widgets
        },
        provide(field) {
            return EditorView.decorations.from(field);
        }
    });

    return noteBlockStartField;
};




function atomicRanges(view) {
    let builder = new RangeSetBuilder()
    view.state.facet(blockState).forEach(block => {
        builder.add(
            block.delimiter.from,
            block.delimiter.to,
            {},
        )
    })
    return builder.finish()
}
const atomicNoteBlock = ViewPlugin.fromClass(
    class {
        constructor(view) {
            this.atomicRanges = atomicRanges(view)
        }

        update(update) {
            if (update.docChanged) {
                this.atomicRanges = atomicRanges(update.view)
            }
        }
    },
    {
        provide: plugin => EditorView.atomicRanges.of(view => {
            return view.plugin(plugin)?.atomicRanges || []
        })
    }
)


const blockLayer = layer({
    above: false,

    markers(view) {
        const markers = []
        let idx = 0
        //console.log("visible ranges:", view.visibleRanges[0].from, view.visibleRanges[0].to, view.visibleRanges.length)
        function rangesOverlaps(range1, range2) {
            return range1.from <= range2.to && range2.from <= range1.to
        }
        const blocks = view.state.facet(blockState)
        blocks.forEach(block => {
            // make sure the block is visible
            if (!view.visibleRanges.some(range => rangesOverlaps(block.content, range))) {
                idx++;
                return
            }
            const fromCoordsTop = view.coordsAtPos(Math.max(block.content.from, view.visibleRanges[0].from)).top
            let toCoordsBottom = view.coordsAtPos(Math.min(block.content.to, view.visibleRanges[view.visibleRanges.length - 1].to)).bottom
            if (idx === blocks.length - 1) {
                // Calculate how much extra height we need to add to the last block
                let extraHeight = view.viewState.editorHeight - (
                    view.defaultLineHeight + // when scrolling furthest down, one line is still shown at the top
                    view.documentPadding.top +
                    7
                )
                toCoordsBottom += extraHeight
            }
            markers.push(new RectangleMarker(
                idx++ % 2 == 0 ? "block-even" : "block-odd",
                0,
                // Change "- 0 - 6" to "+ 1 - 6" on the following line, and "+ 1 + 13" to "+2 + 13" on the line below, 
                // in order to make the block backgrounds to have no gap between them
                fromCoordsTop - (view.documentTop - view.documentPadding.top) - 0 - 6,
                null, // width is set to 100% in CSS
                (toCoordsBottom - fromCoordsTop) + 1 + 13,
            ))
        })
        return markers
    },

    update(update, dom) {
        return update.docChanged || update.viewportChanged
    },

    class: "blocks-layer"
})


const preventFirstBlockFromBeingDeleted = EditorState.changeFilter.of((tr) => {
    //console.log("annotations:", tr.annotation(heynoteEvent), tr.annotations.some(a => tr.annotation(heynoteEvent))) 
    if (!tr.annotations.some(a => a.type === heynoteEvent) && firstBlockDelimiterSize) {
        return [0, firstBlockDelimiterSize]
    }
})

/**
 * Transaction filter to prevent the selection from being before the first block
  */
const preventSelectionBeforeFirstBlock = EditorState.transactionFilter.of((tr) => {
    if (!firstBlockDelimiterSize) {
        return tr
    }
    tr?.selection?.ranges.forEach(range => {
        // change the selection to after the first block if the transaction sets the selection before the first block
        if (range && range.from < firstBlockDelimiterSize) {
            range.from = firstBlockDelimiterSize
            //console.log("changing the from selection to", markerSize)
        }
        if (range && range.to < firstBlockDelimiterSize) {
            range.to = firstBlockDelimiterSize
            //console.log("changing the from selection to", markerSize)
        }
    })
    return tr
})


const blockLineNumbers = lineNumbers({
    formatNumber(lineNo, state) {
        if (state.doc.lines >= lineNo) {
            const lineOffset = state.doc.line(lineNo).from
            const block = state.facet(blockState).find(block => block.content.from <= lineOffset && block.content.to >= lineOffset)
            if (block) {
                const firstBlockLine = state.doc.lineAt(block.content.from).number
                return lineNo - firstBlockLine + 1
            }
        }
        return ""
    }
})

export const noteBlockExtension = () => {
    return [
        blockState,
        noteBlockWidget(),
        atomicNoteBlock,
        blockLayer,
        preventFirstBlockFromBeingDeleted,
        preventSelectionBeforeFirstBlock,
        blockLineNumbers,
    ]
}
