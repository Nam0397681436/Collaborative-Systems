"use client"

import { VectorClock } from "@/lib/api/documents"
import { useAuth } from "@/lib/auth-context"
import React, { useCallback, useEffect, useRef } from "react"

interface DocumentContentEditorProps {
    remoteCursors: Cursor[]
    editable?: boolean
    initialContent?: string
    socket: WebSocket | null
    currentClock: number
    setCurrentClock: React.Dispatch<React.SetStateAction<number>>
    vectorClock: VectorClock
    setVectorClock: React.Dispatch<React.SetStateAction<VectorClock>>
    handleRemoteEditRef?: React.MutableRefObject<(ops: Operation[], remoteUserId?: string) => void>
}

export type Operation = {
    type: "insert" | "delete"
    char: string
    index: number
    opId?: string
}

export type Cursor = {
    user_id: string
    username: string
    color: string
    index: number
    height?: number
    width?: number
}

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeOffsetResult =
    | { type: 'text'; node: Text; offset: number }
    | { type: 'empty-line'; element: HTMLElement; brElement: HTMLElement }
    | { type: 'br-standalone'; br: HTMLElement }
    | { type: 'end-of-document' }

// ─── Helper ─────────────────────────────────────────────────────────────────

const isEmptyLine = (el: HTMLElement): boolean => {
    if (el.nodeName === 'BR') return true
    return (
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeName === "BR"
    )
}

const getSerializedEditorText = (el: HTMLElement): string => {
    const lines = Array.from(el.childNodes).map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent?.replace(/\r\n/g, "\n") ?? ""
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement

            if (element.nodeName === "BR") {
                return ""
            }

            if (isEmptyLine(element)) {
                return ""
            }

            return (element.textContent ?? "").replace(/\r\n/g, "\n")
        }

        return ""
    })

    return lines.join("\n")
}

const renderEditorText = (el: HTMLElement, text: string) => {
    const lines = text.split("\n")
    el.innerHTML = lines.map(line => {
        if (line === '') return '<div><br></div>'
        return `<div>${line}</div>`
    }).join('')
}

// ─── Unique ID generator ───────────────────────────────────────────────────

let opIdCounter = 0
const generateOpId = (): string => {
    return `op_${Date.now()}_${++opIdCounter}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── OT: Text helpers ────────────────────────────────────────────────────────

function applyOp(text: string, op: Operation): string {
    if (op.type === "insert") {
        const i = Math.max(0, Math.min(op.index, text.length))
        return text.slice(0, i) + op.char + text.slice(i)
    }
    if (op.type === "delete") {
        const len = op.char.length
        if (op.index < 0 || op.index >= text.length) return text
        return text.slice(0, op.index) + text.slice(op.index + len)
    }
    return text
}

function invertOp(op: Operation, text: string): Operation {
    if (op.type === "insert") {
        return { type: "delete", char: op.char, index: op.index }
    }
    return { type: "insert", char: op.char, index: op.index }
}

// Transform op `b` dựa trên op `a` đã được apply trước
function transformAfter(b: Operation, a: Operation, bUserId: string, aUserId: string): Operation {
    const aLen = a.char.length

    if (a.type === "insert" && b.type === "insert") {
        if (a.index < b.index) return { ...b, index: b.index + aLen }
        if (a.index === b.index) {
            return aUserId <= bUserId ? { ...b, index: b.index + aLen } : b
        }
        return b
    }
    if (a.type === "delete" && b.type === "insert") {
        const aEnd = a.index + aLen
        if (aEnd <= b.index) return { ...b, index: b.index - aLen }
        if (a.index < b.index) return { ...b, index: a.index }
        return b
    }
    if (a.type === "insert" && b.type === "delete") {
        if (a.index <= b.index) return { ...b, index: b.index + aLen }
        return b
    }
    if (a.type === "delete" && b.type === "delete") {
        const aEnd = a.index + aLen
        const bEnd = b.index + b.char.length

        if (aEnd <= b.index) return { ...b, index: b.index - aLen }
        if (a.index >= bEnd) return b
        if (a.index <= b.index && bEnd <= aEnd) return { ...b, index: -1 }

        if (b.index <= a.index && aEnd <= bEnd) {
            const beforeA = a.index - b.index
            const afterA = bEnd - aEnd
            const newChar = b.char.slice(0, beforeA) + b.char.slice(b.char.length - afterA)
            return { ...b, char: newChar, index: b.index }
        }

        if (a.index < b.index && aEnd > b.index && aEnd < bEnd) {
            const overlapLen = aEnd - b.index
            const newChar = b.char.slice(overlapLen)
            return { ...b, char: newChar, index: a.index }
        }

        if (a.index > b.index && a.index < bEnd && aEnd > bEnd) {
            const overlapLen = bEnd - a.index
            const newChar = b.char.slice(0, b.char.length - overlapLen)
            return { ...b, char: newChar, index: b.index }
        }

        return b
    }
    return b
}

// Transform một mảng ops qua một op đã apply
function transformOpsArray(ops: Operation[], a: Operation, bUserId: string, aUserId: string): Operation[] {
    return ops.map(op => {
        if (op.index === -1) return op
        return transformAfter(op, a, bUserId, aUserId)
    }).filter(op => op.index !== -1)
}

// Transform một mảng ops qua một mảng ops khác
function transformOpsArrayByArray(ops: Operation[], serverOps: Operation[], bUserId: string, aUserId: string): Operation[] {
    let result = [...ops]
    for (const serverOp of serverOps) {
        result = transformOpsArray(result, serverOp, bUserId, aUserId)
    }
    return result
}

function buildOpsFromTextDiff(prevText: string, nextText: string): Operation[] {
    if (prevText === nextText) return []

    let prefix = 0
    const minLength = Math.min(prevText.length, nextText.length)
    while (prefix < minLength && prevText[prefix] === nextText[prefix]) {
        prefix += 1
    }

    let prevSuffix = prevText.length - 1
    let nextSuffix = nextText.length - 1
    while (prevSuffix >= prefix && nextSuffix >= prefix && prevText[prevSuffix] === nextText[nextSuffix]) {
        prevSuffix -= 1
        nextSuffix -= 1
    }

    const deletedText = prevText.slice(prefix, prevSuffix + 1)
    const insertedText = nextText.slice(prefix, nextSuffix + 1)
    const operations: Operation[] = []

    if (deletedText.length > 0) {
        operations.push({
            type: "delete",
            char: deletedText,
            index: prefix,
            opId: generateOpId(),
        })
    }

    if (insertedText.length > 0) {
        operations.push({
            type: "insert",
            char: insertedText,
            index: prefix,
            opId: generateOpId(),
        })
    }

    return operations
}

// ─── Component ────────────────────────────────────────────────────────────────

const DocumentContentEditor: React.FC<DocumentContentEditorProps> = ({
    remoteCursors,
    editable = true,
    initialContent = "",
    socket,
    currentClock,
    setCurrentClock,
    vectorClock,
    setVectorClock,
    handleRemoteEditRef
}) => {
    const { user } = useAuth()
    const editorRef = useRef<HTMLDivElement>(null)
    const cursorLayerRef = useRef<HTMLDivElement>(null)
    const currentClockRef = useRef(currentClock)
    const vectorClockRef = useRef(vectorClock)
    const editorTextRef = useRef("")
    const isNormalizingDomRef = useRef(false)

    const pendingOpsRef = useRef<Array<{ op: Operation; userId: string; opId: string }>>([])
    const isComposingRef = useRef(false)
    const compositionDataRef = useRef<{ text: string; startIndex: number } | null>(null)

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const batchBaseTextRef = useRef<string | null>(null)

    // Refs to always-latest versions of functions (avoids stale closures)
    const sendBatchOpRef = useRef<() => void>(() => {})
    const sendEditWithClockRef = useRef<(op: Operation) => void>(() => {})

    useEffect(() => {
        currentClockRef.current = currentClock
    }, [currentClock])

    useEffect(() => {
        vectorClockRef.current = vectorClock
    }, [vectorClock])

    // ═══════════════════════════════════════════════════════════════════════
    // Khởi tạo DOM đồng nhất
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!editorRef.current) return

        renderEditorText(editorRef.current, initialContent)
        editorTextRef.current = initialContent
    }, [initialContent])

    // ═══════════════════════════════════════════════════════════════════════
    // 1. getCaretOffset - Encode: DOM → Index
    // ═══════════════════════════════════════════════════════════════════════

    const getCaretOffset = (root: HTMLElement): number => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return 0

        const caretRange = selection.getRangeAt(0)
        const targetNode = caretRange.startContainer
        const targetOffset = caretRange.startOffset

        const leaves: Array<
            | { type: 'text'; node: Text; len: number }
            | { type: 'empty'; element: HTMLElement; br: HTMLElement }
            | { type: 'br-standalone'; br: HTMLElement }
        > = []

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return NodeFilter.FILTER_ACCEPT
                    }
                    if (node.nodeName === 'BR') {
                        return NodeFilter.FILTER_ACCEPT
                    }
                    return NodeFilter.FILTER_SKIP
                }
            }
        )

        let node: Node | null
        while ((node = walker.nextNode()) !== null) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node as Text
                leaves.push({
                    type: 'text',
                    node: text,
                    len: text.textContent?.length ?? 0
                })
            } else if (node.nodeName === 'BR') {
                const br = node as HTMLElement
                const parent = br.parentElement

                if (parent && isEmptyLine(parent)) {
                    if (!leaves.find(l => l.type === 'empty' && l.element === parent)) {
                        leaves.push({
                            type: 'empty',
                            element: parent,
                            br
                        })
                    }
                } else {
                    leaves.push({
                        type: 'br-standalone',
                        br
                    })
                }
            }
        }

        let pos = 0

        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i]

            if (leaf.type === 'text') {
                const { node, len } = leaf

                if (node === targetNode) {
                    return pos + targetOffset
                }

                pos += len

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    const currentParent = node.parentElement
                    const nextParent = nextLeaf.type === 'text'
                        ? nextLeaf.node.parentElement
                        : nextLeaf.type === 'empty'
                            ? nextLeaf.element
                            : null

                    if (currentParent !== nextParent) {
                        pos += 1

                        if (nextLeaf.type === 'empty') {
                            if (nextLeaf.element === targetNode || nextLeaf.br === targetNode) {
                                return pos
                            }
                        } else if (nextLeaf.type === 'br-standalone') {
                            if (nextLeaf.br === targetNode) {
                                return pos
                            }
                        } else {
                            if (nextLeaf.node === targetNode && targetOffset === 0) {
                                return pos
                            }
                        }
                    }
                }
            } else if (leaf.type === 'empty') {
                const { element, br } = leaf

                if (element === targetNode || br === targetNode) {
                    return pos
                }

                pos += 1

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    const nextParent = nextLeaf.type === 'text'
                        ? nextLeaf.node.parentElement
                        : nextLeaf.type === 'empty'
                            ? nextLeaf.element
                            : null

                    if (element !== nextParent) {
                        pos += 1

                        if (nextLeaf.type === 'empty') {
                            if (nextLeaf.element === targetNode || nextLeaf.br === targetNode) {
                                return pos
                            }
                        } else if (nextLeaf.type === 'br-standalone') {
                            if (nextLeaf.br === targetNode) {
                                return pos
                            }
                        } else {
                            if (nextLeaf.node === targetNode && targetOffset === 0) {
                                return pos
                            }
                        }
                    }
                }
            } else if (leaf.type === 'br-standalone') {
                const { br } = leaf

                if (br === targetNode) {
                    return pos
                }

                pos += 1

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    pos += 1

                    if (nextLeaf.type === 'empty') {
                        if (nextLeaf.element === targetNode || nextLeaf.br === targetNode) {
                            return pos
                        }
                    } else if (nextLeaf.type === 'br-standalone') {
                        if (nextLeaf.br === targetNode) {
                            return pos
                        }
                    } else {
                        if (nextLeaf.node === targetNode && targetOffset === 0) {
                            return pos
                        }
                    }
                }
            }
        }

        return pos
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. indexToNodeOffset - Decode: Index → DOM
    // ═══════════════════════════════════════════════════════════════════════

    const indexToNodeOffset = useCallback((
        root: HTMLElement,
        targetIndex: number
    ): NodeOffsetResult | null => {

        const leaves: Array<
            | { type: 'text'; node: Text; len: number }
            | { type: 'empty'; element: HTMLElement; br: HTMLElement }
            | { type: 'br-standalone'; br: HTMLElement }
        > = []

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return NodeFilter.FILTER_ACCEPT
                    }
                    if (node.nodeName === 'BR') {
                        return NodeFilter.FILTER_ACCEPT
                    }
                    return NodeFilter.FILTER_SKIP
                }
            }
        )

        let node: Node | null
        while ((node = walker.nextNode()) !== null) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node as Text
                leaves.push({
                    type: 'text',
                    node: text,
                    len: text.textContent?.length ?? 0
                })
            } else if (node.nodeName === 'BR') {
                const br = node as HTMLElement
                const parent = br.parentElement

                if (parent && isEmptyLine(parent)) {
                    if (!leaves.find(l => l.type === 'empty' && l.element === parent)) {
                        leaves.push({
                            type: 'empty',
                            element: parent,
                            br
                        })
                    }
                } else {
                    leaves.push({
                        type: 'br-standalone',
                        br
                    })
                }
            }
        }

        let pos = 0

        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i]

            if (leaf.type === 'text') {
                const { node, len } = leaf

                if (pos + len > targetIndex) {
                    return {
                        type: 'text',
                        node,
                        offset: targetIndex - pos
                    }
                }

                pos += len

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    const currentParent = node.parentElement
                    const nextParent = nextLeaf.type === 'text'
                        ? nextLeaf.node.parentElement
                        : nextLeaf.type === 'empty'
                            ? nextLeaf.element
                            : null

                    if (currentParent !== nextParent) {
                        if (pos === targetIndex) {
                            return {
                                type: 'text',
                                node,
                                offset: len
                            }
                        }
                        pos += 1
                    }
                }
            } else if (leaf.type === 'empty') {
                const { element, br } = leaf

                if (pos === targetIndex) {
                    return {
                        type: 'empty-line',
                        element,
                        brElement: br
                    }
                }

                pos += 1

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    const nextParent = nextLeaf.type === 'text'
                        ? nextLeaf.node.parentElement
                        : nextLeaf.type === 'empty'
                            ? nextLeaf.element
                            : null

                    if (element !== nextParent) {
                        if (pos === targetIndex) {
                            if (nextLeaf.type === 'empty') {
                                return {
                                    type: 'empty-line',
                                    element: nextLeaf.element,
                                    brElement: nextLeaf.br
                                }
                            } else if (nextLeaf.type === 'br-standalone') {
                                return {
                                    type: 'br-standalone',
                                    br: nextLeaf.br
                                }
                            }
                            return {
                                type: 'text',
                                node: nextLeaf.node,
                                offset: 0
                            }
                        }
                        pos += 1
                    }
                }
            } else if (leaf.type === 'br-standalone') {
                const { br } = leaf

                if (pos === targetIndex) {
                    return {
                        type: 'br-standalone',
                        br
                    }
                }

                pos += 1

                const nextLeaf = leaves[i + 1]
                if (nextLeaf) {
                    if (pos === targetIndex) {
                        if (nextLeaf.type === 'empty') {
                            return {
                                type: 'empty-line',
                                element: nextLeaf.element,
                                brElement: nextLeaf.br
                            }
                        } else if (nextLeaf.type === 'br-standalone') {
                            return {
                                type: 'br-standalone',
                                br: nextLeaf.br
                            }
                        }
                        return {
                            type: 'text',
                            node: nextLeaf.node,
                            offset: 0
                        }
                    }
                    pos += 1
                }
            }
        }

        if (pos === targetIndex || targetIndex >= pos) {
            return { type: 'end-of-document' }
        }

        return null
    }, [])

    // ═══════════════════════════════════════════════════════════════════════
    // 3. getRectFromIndex - Lấy rect từ index
    // ═══════════════════════════════════════════════════════════════════════

    const getRectFromIndex = useCallback((
        root: HTMLElement,
        index: number
    ): { left: number; top: number; height: number; width: number } | null => {

        const result = indexToNodeOffset(root, index)
        if (!result) {
            const lastText = (() => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
                let last: Text | null = null
                let node: Node | null
                while ((node = walker.nextNode()) !== null) {
                    last = node as Text
                }
                return last
            })()

            if (lastText) {
                const range = document.createRange()
                range.setStart(lastText, lastText.textContent?.length ?? 0)
                range.collapse(true)
                const rect = range.getBoundingClientRect()
                return {
                    left: rect.left,
                    top: rect.top,
                    height: rect.height,
                    width: rect.width || 2
                }
            }

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
            let lastEmpty: HTMLElement | null = null
            let node: Node | null
            while ((node = walker.nextNode()) !== null) {
                const el = node as HTMLElement
                if (isEmptyLine(el)) {
                    lastEmpty = el
                }
            }

            if (lastEmpty) {
                const rect = lastEmpty.getBoundingClientRect()
                return {
                    left: rect.left,
                    top: rect.top,
                    height: rect.height,
                    width: 2
                }
            }

            return null
        }

        if (result.type === 'text') {
            const { node, offset } = result
            try {
                const range = document.createRange()
                range.setStart(node, offset)
                range.collapse(true)
                const rect = range.getBoundingClientRect()

                if (rect.width === 0 && rect.height === 0) {
                    const rects = range.getClientRects()
                    if (rects.length > 0) {
                        return {
                            left: rects[0].left,
                            top: rects[0].top,
                            height: rects[0].height,
                            width: rects[0].width
                        }
                    }
                }
                return {
                    left: rect.left,
                    top: rect.top,
                    height: rect.height,
                    width: rect.width
                }
            } catch (e) {
                console.error("Range error:", e)
                return null
            }
        }

        if (result.type === 'empty-line') {
            const { brElement, element } = result
            const brRect = brElement.getBoundingClientRect()

            if (brRect.height > 0) {
                return {
                    left: brRect.left,
                    top: brRect.top,
                    height: brRect.height,
                    width: brRect.width || 2
                }
            }

            const elRect = element.getBoundingClientRect()
            return {
                left: elRect.left,
                top: elRect.top,
                height: elRect.height,
                width: 2
            }
        }

        if (result.type === 'br-standalone') {
            const brRect = result.br.getBoundingClientRect()

            if (brRect.height > 0) {
                return {
                    left: brRect.left,
                    top: brRect.top,
                    height: brRect.height,
                    width: brRect.width || 2
                }
            }

            const parent = result.br.parentElement
            if (parent) {
                const rect = parent.getBoundingClientRect()
                return {
                    left: rect.left,
                    top: rect.top,
                    height: rect.height,
                    width: 2
                }
            }
        }

        if (result.type === 'end-of-document') {
            const lastText = (() => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
                let last: Text | null = null
                let node: Node | null
                while ((node = walker.nextNode()) !== null) {
                    last = node as Text
                }
                return last
            })()

            if (lastText) {
                const range = document.createRange()
                range.setStart(lastText, lastText.textContent?.length ?? 0)
                range.collapse(true)
                const rect = range.getBoundingClientRect()
                return {
                    left: rect.left,
                    top: rect.top,
                    height: rect.height,
                    width: rect.width || 2
                }
            }
        }

        return null
    }, [indexToNodeOffset])

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Render remote cursors
    // ═══════════════════════════════════════════════════════════════════════

    const renderCursors = useCallback(() => {
        const layer = cursorLayerRef.current
        const editor = editorRef.current
        if (!layer || !editor) return

        layer.innerHTML = ""

        remoteCursors.forEach((cursor) => {
            if (cursor.index === undefined || cursor.index < 0) {
                return
            }

            const rect = getRectFromIndex(editor, cursor.index)
            if (!rect) {
                return
            }

            const editorRect = editor.getBoundingClientRect()
            const left = rect.left - editorRect.left + editor.scrollLeft
            const top = rect.top - editorRect.top + editor.scrollTop
            const height = rect.height || cursor.height || 18

            const cursorContainer = document.createElement("div")
            cursorContainer.style.cssText = `
                position: absolute;
                left: ${left}px;
                top: ${top}px;
                pointer-events: auto;
                z-index: 100;
            `

            const line = document.createElement("div")
            line.style.cssText = `
                position: absolute;
                height: ${height}px;
                width: 1px;
                left: 0;
                top: 0;
                background-color: ${cursor.color};
                animation: blink 1s infinite;
            `

            const label = document.createElement("div")
            label.textContent = cursor.username
            label.style.cssText = `
                position: absolute;
                left: 3px;
                top: -22px;
                background-color: ${cursor.color};
                color: white;
                font-weight: bold;
                font-size: 10px;
                padding: 4px 6px;
                border-radius: 4px;
                white-space: nowrap;
                opacity: 1;
                transition: opacity 0.3s ease-in;
            `

            let hideTimeout: NodeJS.Timeout | null = null

            const startHideTimer = () => {
                if (hideTimeout) clearTimeout(hideTimeout)
                hideTimeout = setTimeout(() => {
                    line.style.opacity = "0"
                    label.style.opacity = "0"
                }, 2000)
            }

            cursorContainer.addEventListener("mouseenter", () => {
                if (hideTimeout) clearTimeout(hideTimeout)
                line.style.opacity = "1"
                label.style.opacity = "1"
            })

            cursorContainer.addEventListener("mouseleave", () => {
                startHideTimer()
            })

            startHideTimer()

            cursorContainer.appendChild(line)
            cursorContainer.appendChild(label)
            layer.appendChild(cursorContainer)
        })
    }, [getRectFromIndex, remoteCursors])

    useEffect(() => {
        renderCursors()
    }, [remoteCursors, renderCursors])

    useEffect(() => {
        const editor = editorRef.current
        if (!editor) return

        const handleUpdate = () => renderCursors()

        editor.addEventListener("scroll", handleUpdate)
        window.addEventListener("resize", handleUpdate)
        editor.addEventListener("input", handleUpdate)

        return () => {
            editor.removeEventListener("scroll", handleUpdate)
            window.removeEventListener("resize", handleUpdate)
            editor.removeEventListener("input", handleUpdate)
        }
    }, [renderCursors])

    // ═══════════════════════════════════════════════════════════════════════
    // Socket helpers
    // ═══════════════════════════════════════════════════════════════════════

    const sendEditWithClock = (op: Operation) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || !user) return

        const newClock = currentClockRef.current + 1
        const newVectorClock = { ...vectorClockRef.current, [user.id]: newClock }
        const opId = op.opId || generateOpId()
        const opWithId = { ...op, opId }

        currentClockRef.current = newClock
        vectorClockRef.current = newVectorClock
        setCurrentClock(newClock)
        setVectorClock(newVectorClock)

        pendingOpsRef.current.push({ op: opWithId, userId: user.id, opId })

        socket.send(JSON.stringify({ type: "EDIT", op: opWithId, v_clock: newVectorClock }))
    }

    // Keep ref always pointing to latest version
    sendEditWithClockRef.current = sendEditWithClock

    const sendCursorPosition = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN || !user || !editorRef.current) return

        const editor = editorRef.current
        const index = getCaretOffset(editor)
        socket.send(JSON.stringify({
            type: "CURSOR",
            index,
        }))
    }

    const sendBatchOp = () => {
        const el = editorRef.current
        if (!el || isNormalizingDomRef.current) return

        const baseText = batchBaseTextRef.current
        if (baseText === null) return

        const currentText = getSerializedEditorText(el)
        const operations = buildOpsFromTextDiff(baseText, currentText)

        batchBaseTextRef.current = null

        if (operations.length === 0) return

        for (const operation of operations) {
            if (operation.type === "insert") {
                console.log("INSERT OP (batch):", operation)
            } else {
                console.log("DELETE OP (batch):", operation)
            }
            // Use ref to always call the latest version (avoid stale closure)
            sendEditWithClockRef.current(operation)
        }

        sendCursorPosition()

        const canonicalHtml = currentText
            .split("\n")
            .map((line) => (line === "" ? "<div><br></div>" : `<div>${line}</div>`))
            .join("")

        if (el.innerHTML !== canonicalHtml) {
            isNormalizingDomRef.current = true
            renderEditorText(el, currentText)
            isNormalizingDomRef.current = false
        }
    }

    // Keep ref always pointing to latest version
    sendBatchOpRef.current = sendBatchOp

    // ═══════════════════════════════════════════════════════════════════════
    // Input handlers
    // ═══════════════════════════════════════════════════════════════════════

    const flushCompositionIfNeeded = useCallback(() => {
        if (!isComposingRef.current || !editorRef.current) return

        const el = editorRef.current
        isComposingRef.current = false

        if (batchBaseTextRef.current === null && compositionDataRef.current) {
            batchBaseTextRef.current = compositionDataRef.current.text
        }

        if (debounceTimerRef.current !== null) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
        }

        const currentText = getSerializedEditorText(el)
        editorTextRef.current = currentText
        compositionDataRef.current = null

        // Call via ref to always use the latest version (avoid stale closure)
        sendBatchOpRef.current()
    }, [])

    useEffect(() => {
        const el = editorRef.current
        if (!el || !editable) return

        const scheduleBatch = () => {
            if (isNormalizingDomRef.current) return

            const currentText = getSerializedEditorText(el)

            if (batchBaseTextRef.current === null) {
                batchBaseTextRef.current = editorTextRef.current
            }

            editorTextRef.current = currentText

            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
            }
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null
                // Call via ref to always use the latest version (avoid stale closure)
                sendBatchOpRef.current()
            }, 300)
        }

        const handleCompositionStart = (e: CompositionEvent) => {
            isComposingRef.current = true
            const editor = editorRef.current
            if (editor) {
                const index = getCaretOffset(editor)
                compositionDataRef.current = {
                    text: getSerializedEditorText(editor),
                    startIndex: index
                }
            }
        }

        const handleCompositionEnd = (e: CompositionEvent) => {
            isComposingRef.current = false
            compositionDataRef.current = null
            scheduleBatch()
        }

        const handleInput = (event: Event) => {
            const inputEvent = event as InputEvent
            if (isComposingRef.current || inputEvent.inputType === "insertCompositionText") {
                return
            }

            scheduleBatch()
        }

        const handleBlur = () => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
                sendBatchOpRef.current()
            }
        }

        const handleBeforeInput = (e: InputEvent) => {
            if (e.inputType === 'insertFromPaste' || e.inputType === 'deleteByCut') {
                if (debounceTimerRef.current !== null) {
                    clearTimeout(debounceTimerRef.current)
                    debounceTimerRef.current = null
                    sendBatchOpRef.current()
                }
            }
        }

        // Flush ngay lập tức khi người dùng di chuyển con trỏ bằng phím mũi tên trái/phải
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                if (debounceTimerRef.current !== null) {
                    clearTimeout(debounceTimerRef.current)
                    debounceTimerRef.current = null
                    sendBatchOpRef.current()
                }
            }
        }

        // Flush ngay lập tức khi người dùng click chuột để di chuyển con trỏ
        const handleMouseDown = () => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
                sendBatchOpRef.current()
            }
        }

        el.addEventListener("compositionstart", handleCompositionStart)
        el.addEventListener("compositionend", handleCompositionEnd)
        el.addEventListener("input", handleInput)
        el.addEventListener("blur", handleBlur)
        el.addEventListener("beforeinput", handleBeforeInput)
        el.addEventListener("keydown", handleKeyDown)
        el.addEventListener("mousedown", handleMouseDown)

        return () => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
                sendBatchOpRef.current()
            }
            el.removeEventListener("compositionstart", handleCompositionStart)
            el.removeEventListener("compositionend", handleCompositionEnd)
            el.removeEventListener("input", handleInput)
            el.removeEventListener("blur", handleBlur)
            el.removeEventListener("beforeinput", handleBeforeInput)
            el.removeEventListener("keydown", handleKeyDown)
            el.removeEventListener("mousedown", handleMouseDown)
        }
    }, [editable])

    // Cursor move
    const handleMoveCursor = (
        event?: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>
    ) => {
        if (!editorRef.current) return

        if (event && "key" in event) {
            const isPrintableKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
            if (isPrintableKey) {
                return
            }
        }

        if (debounceTimerRef.current !== null) return
        sendCursorPosition()
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Remote edit handler - Xử lý mảng ops
    // ═══════════════════════════════════════════════════════════════════════

    const handleRemoteEdit = useCallback((ops: Operation[], remoteUserId?: string) => {
        if (!editorRef.current || !user) return
        const el = editorRef.current

        const isMine = remoteUserId === user.id

        // ── Self-ops: dequeue tất cả ops trong mảng ───────────────────────
        if (isMine) {
            for (const op of ops) {
                if (op.opId) {
                    const pendingIndex = pendingOpsRef.current.findIndex(p => p.opId === op.opId)
                    if (pendingIndex !== -1) {
                        pendingOpsRef.current.splice(pendingIndex, 1)
                    }
                } else {
                    if (pendingOpsRef.current.length > 0 && pendingOpsRef.current[0].userId === user.id) {
                        pendingOpsRef.current.shift()
                    }
                }
            }
            return
        }

        // ── Op của người khác ───────────────────────────────────────────────
        if (isComposingRef.current) {
            flushCompositionIfNeeded()
        }

        if (debounceTimerRef.current !== null) {
            clearTimeout(debounceTimerRef.current)
            debounceTimerRef.current = null
            // Call via ref to always use the latest version (avoid stale closure)
            sendBatchOpRef.current()
        }

        const localCaretBefore = getCaretOffset(el)

        // Bước 1: lấy text hiện tại
        let text = getSerializedEditorText(el)

        // Bước 2: undo tất cả pending ops theo thứ tự ngược
        const pending = [...pendingOpsRef.current]
        for (let i = pending.length - 1; i >= 0; i--) {
            const inv = invertOp(pending[i].op, text)
            text = applyOp(text, inv)
        }

        // Bước 3: apply TẤT CẢ server ops lên text sạch
        for (const op of ops) {
            if (op.index < -1) continue
            text = applyOp(text, op)
        }

        // Bước 4: redo pending ops, transform qua TẤT CẢ server ops
        const serverId = remoteUserId ?? ""
        let transformedPending = pending.map(p => p.op)

        for (const serverOp of ops) {
            transformedPending = transformOpsArray(transformedPending, serverOp, user.id, serverId)
        }

        // Apply các pending đã transform và build new pending array
        const newPendingOps: typeof pendingOpsRef.current = []
        for (let i = 0; i < transformedPending.length; i++) {
            const p = transformedPending[i]
            if (p.index !== -1) {
                text = applyOp(text, p)
                newPendingOps.push({ ...pending[i], op: p })
            }
        }

        pendingOpsRef.current = newPendingOps

        // Bước 5: render kết quả cuối
        isNormalizingDomRef.current = true
        renderEditorText(el, text)
        isNormalizingDomRef.current = false
        editorTextRef.current = text

        // Cập nhật batchBaseTextRef nếu đang trong batch
        if (batchBaseTextRef.current !== null) {
            batchBaseTextRef.current = text
        }

        // Bước 6: khôi phục caret của local user, điều chỉnh theo TẤT CẢ server ops
        let restoredCaret = localCaretBefore
        for (const op of ops) {
            const opLen = op.char.length
            if (op.type === "insert") {
                if (op.index <= restoredCaret) {
                    restoredCaret += opLen
                }
            } else if (op.type === "delete") {
                const opEnd = op.index + opLen
                if (opEnd <= restoredCaret) {
                    restoredCaret -= opLen
                } else if (op.index < restoredCaret) {
                    restoredCaret = op.index
                }
            }
        }

        restoredCaret = Math.max(0, Math.min(restoredCaret, text.length))

        const result = indexToNodeOffset(el, restoredCaret)
        if (result) {
            const selection = window.getSelection()
            if (selection) {
                const range = document.createRange()
                try {
                    if (result.type === 'text') {
                        range.setStart(result.node, result.offset)
                    } else if (result.type === 'empty-line') {
                        range.setStart(result.brElement, 0)
                    } else if (result.type === 'br-standalone') {
                        range.setStart(result.br, 0)
                    } else {
                        range.selectNodeContents(el)
                        range.collapse(false)
                    }
                    range.collapse(true)
                    selection.removeAllRanges()
                    selection.addRange(range)
                } catch (_) {
                    // Bỏ qua lỗi range nếu DOM chưa sẵn sàng
                }
            }
        }
    }, [user, indexToNodeOffset, flushCompositionIfNeeded])

    useEffect(() => {
        if (!handleRemoteEditRef) return
        handleRemoteEditRef.current = handleRemoteEdit
    }, [handleRemoteEditRef, handleRemoteEdit])


    // ═══════════════════════════════════════════════════════════════════════
    // Render
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div className="w-full max-w-4xl mx-auto py-8 px-4 md:px-8 border shadow-sm bg-white rounded-xl">
            <div className="relative">
                <div
                    ref={editorRef}
                    contentEditable={editable}
                    suppressContentEditableWarning
                    spellCheck={false}
                    onKeyUp={handleMoveCursor}
                    onClick={handleMoveCursor}
                    className={`
                        min-h-screen
                        whitespace-pre-wrap
                        wrap-break-word
                        focus:outline-none
                        text-black
                        leading-relaxed
                        ${!editable ? "pointer-events-none opacity-80" : ""}
                    `}
                />
                <div
                    ref={cursorLayerRef}
                    className="absolute inset-0 pointer-events-none"
                    style={{ zIndex: 10 }}
                />
            </div>
        </div>
    )
}

export default DocumentContentEditor