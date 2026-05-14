import React from 'react'

interface DocumentContentEditorProps {
    editable?: boolean
}

const DocumentContentEditor: React.FC<DocumentContentEditorProps> = ({ editable = true }) => {
    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        // Handle content changes here (e.g., update state, send to backend, etc.)
        if (!editable) return
        console.log("Content changed:", e.currentTarget.innerText)
    }

    return (
        <div className="w-full max-w-4xl mx-auto py-8 px-4 md:px-8 border shadow-sm  bg-white">
            <div
                onInput={handleInput}
                contentEditable={editable}
                suppressContentEditableWarning={true}
                className={`min-h-[calc(100vh)] bg-transparent text-foreground focus:outline-none prose prose-invert max-w-none leading-relaxed ${!editable ? "pointer-events-none opacity-80" : ""}`}
            ></div>
        </div>
    )
}

export default DocumentContentEditor