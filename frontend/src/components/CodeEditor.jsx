import { useEffect, useId } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TypeScriptWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    return label === 'typescript' || label === 'javascript'
      ? new TypeScriptWorker()
      : new EditorWorker()
  },
}
loader.config({ monaco })

function defineTheme(editor) {
  editor.editor.defineTheme('codecrew', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '66756E', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C6A1E9' },
      { token: 'string', foreground: 'A7D9A0' },
      { token: 'number', foreground: 'E9BB86' },
    ],
    colors: {
      'editor.background': '#111415',
      'editor.foreground': '#D4DDD8',
      'editorLineNumber.foreground': '#46514C',
      'editorLineNumber.activeForeground': '#ACBCB2',
      'editor.lineHighlightBackground': '#181D1B',
      'editor.selectionBackground': '#34544380',
      'editorCursor.foreground': '#91E7B8',
      'editor.inactiveSelectionBackground': '#34544340',
      'editorIndentGuide.background1': '#242D28',
    },
  })
}

export default function CodeEditor({
  language,
  value,
  onChange,
  onCursorChange,
  onRun,
  readOnly = false,
}) {
  const editorId = useId()
  const modelBase = `inmemory://codecrew/${encodeURIComponent(editorId)}/`

  useEffect(
    () => () => {
      for (const filename of ['main.py', 'main.js']) {
        monaco.editor
          .getModel(monaco.Uri.parse(`${modelBase}${filename}`))
          ?.dispose()
      }
    },
    [modelBase],
  )

  return (
    <Editor
      height="100%"
      language={language}
      path={`${modelBase}${language === 'python' ? 'main.py' : 'main.js'}`}
      keepCurrentModel
      value={value}
      onChange={(next) => {
        // Controlled snapshots and model switches must never become outgoing edits.
        if (!readOnly && (next ?? '') !== value) onChange(next ?? '')
      }}
      theme="codecrew"
      beforeMount={defineTheme}
      loading={
        <div className="editor-loading">
          <span className="loading-dot" /> Getting your workspace ready…
        </div>
      }
      onMount={(editor, api) => {
        editor.addAction({
          id: 'codecrew-run',
          label: 'Run code',
          keybindings: [api.KeyMod.CtrlCmd | api.KeyCode.Enter],
          run: onRun,
        })
        editor.onDidChangeCursorPosition((e) => onCursorChange(e.position))
      }}
      options={{
        readOnly,
        fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
        fontSize: 14,
        lineHeight: 25,
        minimap: { enabled: false },
        padding: { top: 24, bottom: 24 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        automaticLayout: true,
        editContext: false,
        tabSize: language === 'python' ? 4 : 2,
        wordWrap: 'on',
        lineNumbersMinChars: 4,
        renderLineHighlight: 'all',
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
        bracketPairColorization: { enabled: true },
      }}
    />
  )
}
