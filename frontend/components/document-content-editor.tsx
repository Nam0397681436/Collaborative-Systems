"use client"

import { VectorClock } from "@/lib/api/documents"
import { useAuth } from "@/lib/auth-context"
import React, { useEffect, useRef } from "react"

interface DocumentContentEditorProps {
    editable?: boolean
    initialContent?: string
    socket: WebSocket | null
    currentClock: number
    setCurrentClock: React.Dispatch<React.SetStateAction<number>>
    vectorClock: VectorClock
    setVectorClock: React.Dispatch<React.SetStateAction<VectorClock>>
}

type Operation = {
    type: "insert" | "delete"
    char: string
    index: number
}

const DocumentContentEditor: React.FC<DocumentContentEditorProps> = ({
    editable = true,
    initialContent = "",
    socket,
    currentClock,
    setCurrentClock,
    vectorClock,
    setVectorClock
}) => {
    const { user } = useAuth() // Giả sử có hook useAuth để lấy thông tin user
    const editorRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!editorRef.current) return

        editorRef.current.innerText = initialContent
    }, [initialContent])

    const sendEditWithClock = (op: Operation) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || !user) {
            return
        }

        const newClock = currentClock + 1
        const newVectorClock = {
            ...vectorClock,
            [user.id]: newClock
        }

        setCurrentClock(newClock)
        setVectorClock((prev) => ({
            ...prev,
            [user.id]: newClock
        }))

        socket.send(JSON.stringify({
            type: "EDIT",
            op,
            v_clock: newVectorClock
        }))
    }


    /**
     * Tính offset thật trong contentEditable
     */
    const getCaretOffset = (
        root: HTMLElement,
        targetNode: Node,
        targetOffset: number
    ): number => {
        let offset = 0
        let found = false

        const walk = (node: Node) => {
            if (found) return

            // caret node
            if (node === targetNode) {
                if (node.nodeType === Node.TEXT_NODE) {
                    offset += targetOffset
                }

                found = true
                return
            }

            // text
            if (node.nodeType === Node.TEXT_NODE) {
                offset += node.textContent?.length ?? 0
                return
            }

            // empty block line
            if (
                node.nodeType === Node.ELEMENT_NODE &&
                ["DIV", "P"].includes(
                    (node as HTMLElement).tagName
                )
            ) {
                const el = node as HTMLElement

                const isEmptyLine =
                    el.childNodes.length === 1 &&
                    el.childNodes[0].nodeName === "BR"

                // newline cho empty line
                if (isEmptyLine) {
                    offset += 1
                    return
                }

                // block bình thường
                const parent = el.parentNode

                if (
                    node !== root &&
                    parent &&
                    parent.childNodes[0] !== node
                ) {
                    offset += 1
                }
            }

            // br standalone
            if (node.nodeName === "BR") {
                offset += 1
                return
            }

            for (const child of Array.from(node.childNodes)) {
                walk(child)

                if (found) return
            }
        }

        walk(root)

        return offset
    }

    /**
     * caret position
     */
    const getCaretPosition = (
        el: HTMLElement
    ): number => {
        const selection = window.getSelection()

        if (!selection || selection.rangeCount === 0) {
            return 0
        }

        const range = selection.getRangeAt(0)

        return getCaretOffset(
            el,
            range.endContainer,
            range.endOffset
        )
    }

    /**
     * raw text
     */
    const getRawText = (el: HTMLElement) => {
        return el.innerText.replace(/\r\n/g, "\n")
    }

    /**
     * INSERT operation
     */
    useEffect(() => {
        const el = editorRef.current

        if (!el || !editable) return

        /**
         * ENTER
         * dùng beforeinput vì DOM chưa update
         */
        const handleBeforeInput = (
            e: InputEvent
        ) => {
            const isNewLine =
                e.inputType === "insertParagraph" ||
                e.inputType === "insertLineBreak"

            if (!isNewLine) return

            const index = getCaretPosition(el)

            const op: Operation = {
                type: "insert",
                char: "\n",
                index,
            }

            console.log("INSERT OP:", op)

            sendEditWithClock(op)
        }

        /**
         * TEXT INSERT
         * dùng input vì DOM đã update
         */
        const handleInput = (e: Event) => {
            const inputEvent = e as InputEvent

            if (
                inputEvent.inputType !==
                "insertText"
            ) {
                return
            }

            const char = inputEvent.data

            if (!char) return

            const position = getCaretPosition(el)

            const op: Operation = {
                type: "insert",
                char,
                index: position - 1,
            }

            console.log("INSERT OP:", op)

            sendEditWithClock(op)
        }

        el.addEventListener(
            "beforeinput",
            handleBeforeInput
        )

        el.addEventListener(
            "input",
            handleInput
        )

        return () => {
            el.removeEventListener(
                "beforeinput",
                handleBeforeInput
            )

            el.removeEventListener(
                "input",
                handleInput
            )
        }
    }, [editable])

    /**
     * DELETE operation
     */
    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLDivElement>
    ) => {
        if (!editorRef.current) return

        const el = editorRef.current

        const value = getRawText(el)

        const position = getCaretPosition(el)

        let op: Operation | null = null

        /**
         * BACKSPACE
         */
        if (e.key === "Backspace") {
            if (position <= 0) return

            const index = position - 1

            op = {
                type: "delete",
                char: value[index],
                index,
            }
        }

        /**
         * DELETE
         */
        if (e.key === "Delete") {
            if (position >= value.length) return

            op = {
                type: "delete",
                char: value[position],
                index: position,
            }
        }

        if (op) {
            console.log("DELETE OP:", op)

            sendEditWithClock(op)
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
                    wrap-break-word
                    focus:outline-none
                    text-black
                    leading-relaxed
                    ${!editable
                        ? "pointer-events-none opacity-80"
                        : ""}
                `}
            />
        </div>
    )
}

export default DocumentContentEditor