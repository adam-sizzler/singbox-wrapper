import type { Monaco } from '@monaco-editor/react';

let schemaConfigured = false;

export async function setupMonacoEditor(monaco: Monaco, isDark: boolean = true) {
  // Setup Sing-box JSON Schema
  if (!schemaConfigured) {
    try {
      const resp = await fetch('./singbox.schema.json');
      if (resp.ok) {
        const schema = await resp.json();
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: true,
          enableSchemaRequest: true,
          schemas: [
            {
              fileMatch: ['*'],
              uri: 'https://sing-box.sagernet.org/schema.json',
              schema,
            },
          ],
        });
        schemaConfigured = true;
      }
    } catch (e) {
      console.warn('Failed to load singbox.schema.json for Monaco:', e);
    }
  }

  // Exodus-style Dark Theme
  monaco.editor.defineTheme('singbox-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { background: '161b22', token: '' },
      { foreground: '8b949e', token: 'comment' },
      { foreground: '54aeff', token: 'constant' },
      { foreground: 'ffb77c', token: 'entity' },
      { foreground: 'fae17d', token: 'keyword' },
      { foreground: 'fae17d', token: 'storage' },
      { foreground: 'aceebb', token: 'string' },
      { foreground: 'aceebb', token: 'meta.verbatim' },
      { foreground: '54aeff', token: 'support' },
      { foreground: 'c9d1d9', token: 'string.key.json' },
      { foreground: 'aceebb', token: 'string.value.json' },
      { foreground: '54aeff', token: 'number' },
    ],
    colors: {
      'editor.foreground': '#c9d1d9',
      'editor.background': '#161b22',
      'editor.selectionBackground': '#0969da55',
      'editor.selectionHighlightBackground': '#0969da33',
      'editor.inactiveSelectionBackground': '#0969da22',
      'editor.lineHighlightBackground': '#21262d',
      'editorCursor.foreground': '#54aeff',
      'editorWhitespace.foreground': '#484f58',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editorWidget.background': '#1c2128',
      'editorWidget.border': '#30363d',
      'editorWidget.foreground': '#c9d1d9',
      'editorHoverWidget.background': '#1c2128',
      'editorHoverWidget.border': '#30363d',
      'editorHoverWidget.foreground': '#c9d1d9',
      'editorSuggestWidget.background': '#1c2128',
      'editorSuggestWidget.border': '#30363d',
      'editorSuggestWidget.foreground': '#c9d1d9',
      'editorSuggestWidget.selectedBackground': '#21262d',
      'editorSuggestWidget.highlightForeground': '#54aeff',
      'editorIndentGuide.background': '#30363d',
      'editorIndentGuide.activeBackground': '#6e7681',
    },
  });

  // Exodus-style Light Theme
  monaco.editor.defineTheme('singbox-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { foreground: '6e7781', token: 'comment', fontStyle: 'italic' },
      { foreground: '0550ae', token: 'constant' },
      { foreground: '953800', token: 'entity' },
      { foreground: 'cf222e', token: 'keyword' },
      { foreground: 'cf222e', token: 'storage' },
      { foreground: '0a3069', token: 'string' },
      { foreground: '116329', token: 'string.key.json' },
      { foreground: '0a3069', token: 'string.value.json' },
      { foreground: '0550ae', token: 'number' },
    ],
    colors: {
      'editor.foreground': '#24292f',
      'editor.background': '#ffffff',
      'editor.selectionBackground': '#0969da33',
      'editor.selectionHighlightBackground': '#0969da20',
      'editor.inactiveSelectionBackground': '#0969da15',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editorCursor.foreground': '#0969da',
      'editorWhitespace.foreground': '#afb8c1',
      'editorLineNumber.foreground': '#8c959f',
      'editorLineNumber.activeForeground': '#24292f',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#d0d7de',
      'editorWidget.foreground': '#24292f',
      'editorIndentGuide.background': '#d0d7de',
      'editorIndentGuide.activeBackground': '#8c959f',
    },
  });

  monaco.editor.setTheme(isDark ? 'singbox-dark' : 'singbox-light');
}
