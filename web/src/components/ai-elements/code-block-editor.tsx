/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/* eslint-disable react-refresh/only-export-components */
'use client'

import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { tags as highlightTags } from '@lezer/highlight'
import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import type { BundledLanguage } from 'shiki'

type CodeMirrorCodeViewProps = {
  ariaLabel: string
  autoFocus?: boolean
  language: BundledLanguage | string
  onChange?: (value: string) => void
  onKeyDown?: (event: globalThis.KeyboardEvent) => void
  readOnly?: boolean
  rows?: number
  showLineNumbers?: boolean
  value: string
}

const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  csharp: 'c#',
  golang: 'go',
  js: 'javascript',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
}

const LANGUAGE_PATTERN = /^[a-z0-9][a-z0-9+#._-]{0,31}$/i

const codeMirrorTheme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--foreground)',
    fontSize: '13px',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.5rem',
    minHeight: 'var(--code-editor-min-height)',
    minWidth: 'max-content',
    padding: '1rem 1rem 1rem 0',
  },
  '.cm-editor': {
    background: 'transparent',
    width: '100%',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    background: 'transparent',
    borderRight: '0',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.5rem',
    padding: '1rem 1rem 1rem 0',
  },
  '.cm-gutters:empty': {
    display: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2.5rem',
    padding: '0 1rem 0 0',
    textAlign: 'right',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.5rem',
    minHeight: 'var(--code-editor-min-height)',
    overflow: 'auto',
  },
  '.cm-selectionBackground': {
    background:
      'color-mix(in oklch, var(--primary) 28%, transparent) !important',
  },
})

const codeMirrorHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: highlightTags.heading, color: '#e06c75', fontWeight: '600' },
    { tag: [highlightTags.strong, highlightTags.emphasis], color: '#d19a66' },
    { tag: [highlightTags.link, highlightTags.url], color: '#61afef' },
    {
      tag: [highlightTags.monospace, highlightTags.contentSeparator],
      color: '#98c379',
    },
    {
      tag: [highlightTags.keyword, highlightTags.processingInstruction],
      color: '#c678dd',
    },
    {
      tag: [highlightTags.atom, highlightTags.bool, highlightTags.number],
      color: '#d19a66',
    },
    { tag: [highlightTags.string, highlightTags.inserted], color: '#98c379' },
    { tag: [highlightTags.deleted, highlightTags.invalid], color: '#e06c75' },
    {
      tag: [highlightTags.meta, highlightTags.comment],
      color: 'var(--muted-foreground)',
    },
  ])
)

export function getRequestedCodeLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase() || 'plaintext'
  if (!LANGUAGE_PATTERN.test(normalized)) {
    return 'plaintext'
  }

  return LANGUAGE_ALIASES[normalized] ?? normalized
}

function getCodeMirrorLanguageExtension(language: BundledLanguage | string) {
  const requestedLanguage = getRequestedCodeLanguage(language)
  if (
    requestedLanguage === 'markdown' ||
    requestedLanguage === 'md' ||
    requestedLanguage === 'mdx'
  ) {
    return markdown()
  }

  return []
}

export function getCodeLineCount(code: string) {
  if (!code) {
    return 1
  }

  return code.split('\n').length
}

function getCodeBlockHeight(lines: number) {
  return `${Math.max(4, lines) * 1.5 + 2}rem`
}

export function getCodeBlockMaxHeight(
  isCodeCollapsed: boolean,
  previewLines: number,
  maxExpandedLines?: number
): string | undefined {
  if (isCodeCollapsed) {
    return getCodeBlockHeight(previewLines)
  }

  if (maxExpandedLines) {
    return getCodeBlockHeight(maxExpandedLines)
  }

  return undefined
}

function getCodeMirrorExtensions(options: {
  language: BundledLanguage | string
  onKeyDown: (event: globalThis.KeyboardEvent) => void
  readOnly: boolean
  showLineNumbers: boolean
}): Extension[] {
  const extensions: Extension[] = [
    getCodeMirrorLanguageExtension(options.language),
    codeMirrorHighlightStyle,
    codeMirrorTheme,
    EditorState.tabSize.of(2),
    EditorState.readOnly.of(options.readOnly),
    EditorView.editable.of(!options.readOnly),
    EditorView.domEventHandlers({
      keydown(event) {
        options.onKeyDown(event)
        return event.defaultPrevented
      },
    }),
  ]

  if (options.showLineNumbers) {
    extensions.unshift(lineNumbers())
  }

  return extensions
}

export function CodeMirrorCodeView({
  ariaLabel,
  autoFocus = false,
  language,
  onChange,
  onKeyDown,
  readOnly = false,
  rows = 8,
  showLineNumbers = true,
  value,
}: CodeMirrorCodeViewProps) {
  const editorHostRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onKeyDownRef = useRef(onKeyDown)
  const editorMinHeight = `${Math.max(4, rows) * 1.5 + 2}rem`
  // onKeyDown is delivered through a ref so a new handler identity from the
  // parent (recreated on every keystroke-driven render) does not invalidate
  // the extensions and tear down the EditorView, which would reset the cursor
  // to the document start and make typing appear right-to-left.
  const editorExtensions = useMemo(
    () =>
      getCodeMirrorExtensions({
        language,
        onKeyDown: (event) => onKeyDownRef.current?.(event),
        readOnly,
        showLineNumbers,
      }),
    [language, readOnly, showLineNumbers]
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onKeyDownRef.current = onKeyDown
  }, [onChange, onKeyDown])

  useEffect(() => {
    const editorHost = editorHostRef.current
    if (!editorHost) {
      return
    }

    const editorView = new EditorView({
      doc: initialValueRef.current,
      extensions: [
        ...editorExtensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        }),
      ],
      parent: editorHost,
    })
    editorViewRef.current = editorView
    if (autoFocus) {
      editorView.focus()
    }

    return () => {
      editorView.destroy()
      editorViewRef.current = null
    }
  }, [autoFocus, editorExtensions])

  useEffect(() => {
    // Track the latest value so a future editor rebuild (e.g. language change)
    // starts from the current document instead of the mount-time snapshot.
    initialValueRef.current = value

    const editorView = editorViewRef.current
    if (!editorView) {
      return
    }

    const currentValue = editorView.state.doc.toString()
    if (currentValue === value) {
      return
    }

    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: value,
      },
    })
  }, [value])

  return (
    <div
      aria-label={ariaLabel}
      aria-readonly={readOnly}
      className='min-h-(--code-editor-min-height)'
      ref={editorHostRef}
      role='textbox'
      style={
        {
          '--code-editor-min-height': editorMinHeight,
        } as CSSProperties
      }
    />
  )
}
