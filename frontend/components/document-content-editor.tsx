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
    handleRemoteEditRef?: React.MutableRefObject<(op: Operation, remoteUserId?: string) => void>
}

export type Operation = {
    type: "insert" | "delete"
    char: string
    index: number
}

export type Cursor = {
    user_id: string
    username: string
    color: string
    left: number
    top: number
    height: number
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

// ─── OT: Text helpers ────────────────────────────────────────────────────────

// Apply một op lên chuỗi text thuần
// op.char có thể là chuỗi nhiều ký tự (batch mode)
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

// Inverse của một op (để undo)
function invertOp(op: Operation, text: string): Operation {
    if (op.type === "insert") {
        // undo insert → delete tại đúng index đó
        return { type: "delete", char: op.char, index: op.index }
    }
    // undo delete → insert lại ký tự đó
    return { type: "insert", char: op.char, index: op.index }
}

// Transform op `b` dựa trên op `a` đã được apply trước
// Dùng để tái apply pending ops sau khi đã insert server op
// op.char có thể là chuỗi nhiều ký tự → shift theo char.length
function transformAfter(b: Operation, a: Operation, bUserId: string, aUserId: string): Operation {
    const aLen = a.char.length

    if (a.type === "insert" && b.type === "insert") {
        if (a.index < b.index) return { ...b, index: b.index + aLen }
        if (a.index === b.index) {
            // tie-break: user_id nhỏ hơn thắng (chèn trước) → b bị đẩy phải
            return aUserId <= bUserId ? { ...b, index: b.index + aLen } : b
        }
        return b
    }
    if (a.type === "delete" && b.type === "insert") {
        const aEnd = a.index + aLen
        if (aEnd <= b.index) return { ...b, index: b.index - aLen }
        if (a.index < b.index) return { ...b, index: a.index } // b bị nuốt vào vùng xóa → về đầu vùng
        return b
    }
    if (a.type === "insert" && b.type === "delete") {
        if (a.index <= b.index) return { ...b, index: b.index + aLen }
        return b
    }
    if (a.type === "delete" && b.type === "delete") {
        const aEnd = a.index + aLen
        if (aEnd <= b.index) return { ...b, index: b.index - aLen }
        if (a.index >= b.index + b.char.length) return b // a sau b, không ảnh hưởng
        // b.index nằm trong vùng xóa của a → no-op
        if (a.index <= b.index && b.index < aEnd) return { ...b, index: -1 }
        return b
    }
    return b
}

// Tạo tối đa 2 ops từ diff: 1 delete batch + 1 insert batch
// Thay vì N ops đơn lẻ, trả về op duy nhất với char là chuỗi
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

    // Một delete op duy nhất cho toàn bộ chuỗi bị xóa
    if (deletedText.length > 0) {
        operations.push({
            type: "delete",
            char: deletedText,
            index: prefix,
        })
    }

    // Một insert op duy nhất cho toàn bộ chuỗi được chèn
    if (insertedText.length > 0) {
        operations.push({
            type: "insert",
            char: insertedText,
            index: prefix,
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

    // ── OT: pending ops đã gửi lên server nhưng chưa được ack ────────────────
    // Mỗi entry gồm op + user_id của mình để dùng tie-breaking
    const pendingOpsRef = useRef<Array<{ op: Operation; userId: string }>>([])
    const isComposingRef = useRef(false)

    // ── Debounce: gộp nhiều keystroke thành một batch op sau 500ms ───────────
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Text đã "snapshot" tại thời điểm bắt đầu batch (trước khi người dùng bắt đầu gõ chuỗi hiện tại)
    const batchBaseTextRef = useRef<string | null>(null)

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
        
        // Tạo DOM đồng nhất từ initialContent
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

        // Thu thập leaves - xử lý cả <div> và <br> trực tiếp
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
                    // <br> trong <div><br></div>
                    if (!leaves.find(l => l.type === 'empty' && l.element === parent)) {
                        leaves.push({
                            type: 'empty',
                            element: parent,
                            br
                        })
                    }
                } else {
                    // <br> trực tiếp
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
                            // Cursor ở cuối dòng → trả về cuối node hiện tại,
                            // KHÔNG nhảy sang đầu dòng dưới
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
            
            // Fallback: dùng rect của parent hoặc vị trí ước tính
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
            if (cursor.left === undefined || cursor.top === undefined || cursor.height === undefined) {
                return
            }

            const cursorContainer = document.createElement("div")
            cursorContainer.style.cssText = `
                position: absolute;
                left: ${cursor.left}px;
                top: ${cursor.top}px;
                pointer-events: auto;
                z-index: 100;
            `

            const line = document.createElement("div")
            line.style.cssText = `
                position: absolute;
                height: ${cursor.height}px;
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

            // Auto-hide sau 2 giây khi render
            startHideTimer()

            cursorContainer.appendChild(line)
            cursorContainer.appendChild(label)
            layer.appendChild(cursorContainer)
        })
    }, [remoteCursors])

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

        currentClockRef.current = newClock
        vectorClockRef.current = newVectorClock
        setCurrentClock(newClock)
        setVectorClock(newVectorClock)

        // Track op này là "pending" — đã apply local nhưng server chưa broadcast lại
        pendingOpsRef.current.push({ op, userId: user.id })

        socket.send(JSON.stringify({ type: "EDIT", op, v_clock: newVectorClock }))
    }

    const sendCursorPosition = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN || !user || !editorRef.current) return

        const editor = editorRef.current
        const index = getCaretOffset(editor)
        const rect = getRectFromIndex(editor, index)
        if (!rect) return

        const editorRect = editor.getBoundingClientRect()
        socket.send(JSON.stringify({
            type: "CURSOR",
            left: rect.left - editorRect.left + editor.scrollLeft,
            top: rect.top - editorRect.top + editor.scrollTop,
            height: rect.height,
            width: rect.width,
        }))
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Raw text
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // Input handlers
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        const el = editorRef.current
        if (!el || !editable) return

        // ── Hàm thực sự gửi batch op lên server ───────────────────────────────
        // Được gọi sau khi debounce timer hết hạn (500ms không gõ)
        const sendBatchOp = () => {
            if (isNormalizingDomRef.current) return

            // baseText = text tại thời điểm bắt đầu batch
            const baseText = batchBaseTextRef.current
            if (baseText === null) return // không có gì để flush

            const currentText = getSerializedEditorText(el)
            const operations = buildOpsFromTextDiff(baseText, currentText)

            // Reset batch state
            batchBaseTextRef.current = null

            if (operations.length === 0) return

            for (const operation of operations) {
                if (operation.type === "insert") {
                    console.log("INSERT OP (batch):", operation)
                } else {
                    console.log("DELETE OP (batch):", operation)
                }
                sendEditWithClock(operation)
            }

            sendCursorPosition()

            // Normalize DOM sau batch
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

        // ── Đặt lịch flush, hủy lịch cũ nếu có (debounce 500ms) ──────────────
        const scheduleBatch = () => {
            if (isNormalizingDomRef.current) return

            const currentText = getSerializedEditorText(el)

            // Lần đầu tiên gõ trong batch mới → snapshot base text
            if (batchBaseTextRef.current === null) {
                batchBaseTextRef.current = editorTextRef.current
            }

            // Luôn cập nhật editorTextRef để lần diff tiếp theo chính xác
            editorTextRef.current = currentText

            // Reset debounce timer
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
            }
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null
                sendBatchOp()
            }, 500)
        }

        const handleCompositionStart = () => {
            isComposingRef.current = true
        }

        const handleCompositionEnd = () => {
            isComposingRef.current = false
            // Flush ngay sau composition kết thúc — lúc này DOM đã có ký tự hoàn chỉnh (ví dụ 'â')
            // Vẫn debounce để gộp với ký tự tiếp theo nếu người dùng gõ tiếp liền ngay
            scheduleBatch()
        }

        const handleInput = (event: Event) => {
            const inputEvent = event as InputEvent
            if (isComposingRef.current || inputEvent.inputType === "insertCompositionText") {
                // Đang compose (IME tiếng Việt/Nhật/...) → chưa flush
                return
            }

            // Dùng setTimeout(0) để đợi browser fire compositionstart (nếu có) trước khi schedule.
            // Ngăn việc gửi ký tự dở ('a') trước khi IME ghép xong ('â').
            setTimeout(() => {
                if (isComposingRef.current) return
                scheduleBatch()
            }, 0)
        }

        el.addEventListener("compositionstart", handleCompositionStart)
        el.addEventListener("compositionend", handleCompositionEnd)
        el.addEventListener("input", handleInput)

        return () => {
            // Flush pending batch khi unmount
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current)
                debounceTimerRef.current = null
                sendBatchOp()
            }
            el.removeEventListener("compositionstart", handleCompositionStart)
            el.removeEventListener("compositionend", handleCompositionEnd)
            el.removeEventListener("input", handleInput)
        }
    }, [editable])

    // Cursor move
    const handleMoveCursor = () => {
        if (!editorRef.current) return
        // Nếu đang trong debounce batch (text chưa gửi lên server),
        // không gửi cursor ngay — cursor sẽ được gửi cùng sendBatchOp() sau 500ms.
        // Điều này đảm bảo cursor và text luôn đến cùng lúc ở client khác.
        if (debounceTimerRef.current !== null) return
        sendCursorPosition()
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Remote edit handler - TẠO DOM ĐỒNG NHẤT
    // ═══════════════════════════════════════════════════════════════════════

    const handleRemoteEdit = useCallback((op: Operation, remoteUserId?: string) => {
        if (!editorRef.current || !user) return
        const el = editorRef.current

        const isMine = remoteUserId === user.id

        if (isMine) {
            // ── Op của chính mình được server confirm ───────────────────────
            // Server đã broadcast lại → dequeue khỏi pending.
            // DOM đã đúng (mình đã apply optimistically) → không cần render lại.
            pendingOpsRef.current.shift()
            return
        }

        // ── Op của người khác ───────────────────────────────────────────────
        // Chiến lược: undo tất cả pending của mình → apply server op → redo pending
        // Đảm bảo server op luôn được apply trên nền text "sạch" (chưa có pending),
        // rồi pending được tái apply với index đã transform.

        // Lưu vị trí caret hiện tại của local user để khôi phục sau khi render
        const localCaretBefore = getCaretOffset(el)

        // Bước 1: lấy text hiện tại (đã có pending applied)
        let text = getSerializedEditorText(el)

        // Bước 2: undo pending ops theo thứ tự ngược
        const pending = [...pendingOpsRef.current]
        for (let i = pending.length - 1; i >= 0; i--) {
            const inv = invertOp(pending[i].op, text)
            text = applyOp(text, inv)
        }

        // Bước 3: apply server op lên text sạch
        if (op.index < -1) return // sanity
        text = applyOp(text, op)

        // Bước 4: redo pending ops, transform từng cái qua server op
        let serverOp = op
        const serverId = remoteUserId ?? ""
        for (let i = 0; i < pending.length; i++) {
            let p = pending[i].op
            // Transform pending op qua server op (và các pending đã redo trước đó)
            p = transformAfter(p, serverOp, pending[i].userId, serverId)
            if (p.index !== -1) {
                text = applyOp(text, p)
                // Cập nhật lại op trong ref với index mới
                pendingOpsRef.current[i] = { ...pending[i], op: p }
                // serverOp tiếp theo cần transform qua p đã redo
                serverOp = p
            } else {
                // pending này thành no-op → xóa khỏi queue
                pendingOpsRef.current.splice(i, 1)
            }
        }

        // Bước 5: render kết quả cuối
        isNormalizingDomRef.current = true
        renderEditorText(el, text)
        isNormalizingDomRef.current = false
        editorTextRef.current = text

        // Bước 6: khôi phục caret của local user, điều chỉnh theo server op
        // op.char có thể là chuỗi → shift theo char.length
        const opLen = op.char.length
        let restoredCaret = localCaretBefore
        if (op.type === "insert") {
            // insert tại vị trí <= caret → caret dịch phải opLen
            if (op.index <= localCaretBefore) restoredCaret += opLen
        } else if (op.type === "delete") {
            const opEnd = op.index + opLen
            if (opEnd <= localCaretBefore) {
                // toàn bộ chuỗi xóa nằm trước caret → caret dịch trái opLen
                restoredCaret -= opLen
            } else if (op.index < localCaretBefore) {
                // caret nằm trong vùng xóa → đặt caret về đầu vùng xóa
                restoredCaret = op.index
            }
            // op.index >= localCaretBefore → xóa sau caret, không ảnh hưởng
        }

        // Đặt lại caret vào đúng vị trí
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
                        // end-of-document: đặt sau node cuối
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
    }, [user, indexToNodeOffset])

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