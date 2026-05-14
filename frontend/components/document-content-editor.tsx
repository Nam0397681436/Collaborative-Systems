"use client"

import React, { useEffect, useRef } from "react"

interface DocumentContentEditorProps {
    editable?: boolean
    initialContent?: string
}

type Operation = {
    type: "insert" | "delete"
    char: string
    index: number
}

const DocumentContentEditor: React.FC<DocumentContentEditorProps> = ({
    editable = true,
    initialContent = "",
}) => {
    const editorRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!editorRef.current) return
        editorRef.current.innerText = initialContent
    }, [initialContent])

    /**
     * Duyệt DOM tree thủ công để tính offset chính xác.
     * contentEditable dùng <br> và <div> thay vì \n thật,
     * nên range.toString() đếm thiếu \n → phải tự walk.
     */
    const getCaretOffset = (
        root: HTMLElement,
        targetNode: Node,
        targetOffset: number
    ): number => {
        let offset = 0
        let found = false

        const walk = (node: Node, parentNode: Node | null): void => {
            if (found) return

            if (node === targetNode) {
                if (node.nodeType === Node.TEXT_NODE) {
                    offset += targetOffset
                }
                found = true
                return
            }

            if (node.nodeType === Node.TEXT_NODE) {
                offset += node.textContent?.length ?? 0
                return
            }

            if (node.nodeName === "BR") {
                offset += 1 // <br> = \n
                return
            }

            // Block elements (div, p) → thêm \n trước nội dung
            // trừ phần tử đầu tiên (root)
            const isBlock =
                node !== root &&
                node.nodeType === Node.ELEMENT_NODE &&
                ["DIV", "P"].includes((node as Element).tagName)

            if (isBlock) {
                // Chỉ thêm \n nếu không phải con đầu tiên của root
                const parent = node.parentNode
                if (parent && parent.childNodes[0] !== node) {
                    offset += 1
                }
            }

            for (const child of Array.from(node.childNodes)) {
                walk(child, node)
                if (found) return
            }
        }

        walk(root, null)
        return offset
    }

    const getCaretPosition = (el: HTMLElement): number => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return 0

        const range = sel.getRangeAt(0)
        return getCaretOffset(el, range.endContainer, range.endOffset)
    }

    const getRawText = (el: HTMLElement): string => {
        // innerText đã xử lý block → \n khá tốt,
        // normalize \r\n → \n cho Windows
        return el.innerText.replace(/\r\n/g, "\n")
    }

    useEffect(() => {
        const el = editorRef.current
        if (!el || !editable) return

        const handleBeforeInput = (e: InputEvent) => {
            const { inputType, data } = e

            // Chỉ bắt insert
            if (
                inputType !== "insertText" &&
                inputType !== "insertParagraph" &&
                inputType !== "insertLineBreak"
            ) return

            const insertedChar =
                inputType === "insertParagraph" ||
                inputType === "insertLineBreak"
                    ? "\n"
                    : data

            if (!insertedChar) return

            // ✅ Đọc position TRƯỚC khi browser thay đổi DOM
            const index = getCaretPosition(el)

            const op: Operation = {
                type: "insert",
                char: insertedChar,
                index,
            }

            console.log("INSERT OP:", op)

            /*
            websocket.send(JSON.stringify({ type: "EDIT", op }))
            */
        }

        el.addEventListener("beforeinput", handleBeforeInput)
        return () => el.removeEventListener("beforeinput", handleBeforeInput)
    }, [editable])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editorRef.current) return

        const el = editorRef.current
        const value = getRawText(el)
        const position = getCaretPosition(el)

        let op: Operation | null = null

        if (e.key === "Backspace") {
            if (position <= 0) return
            const index = position - 1
            op = { type: "delete", char: value[index], index }
        }

        if (e.key === "Delete") {
            if (position >= value.length) return
            op = { type: "delete", char: value[position], index: position }
        }

        if (op) {
            console.log("DELETE OP:", op)
            /*
            websocket.send(JSON.stringify({ type: "EDIT", op }))
            */
        }
    }

    return (
        <div className="w-full max-w-4xl mx-auto py-8 px-4 md:px-8 border shadow-sm bg-white rounded-xl">
            <div
                ref={editorRef}
                contentEditable={editable}
                suppressContentEditableWarning
                spellCheck={false}
                onKeyDown={handleKeyDown}
                className={`
                    min-h-screen
                    whitespace-pre-wrap
                    break-words
                    focus:outline-none
                    text-black
                    
                    leading-relaxed
                    ${!editable ? "pointer-events-none opacity-80" : ""}
                `}
            />
        </div>
    )
}

export default DocumentContentEditor