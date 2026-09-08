import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import {
  FileCode2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  WrapText,
  Map,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  TbClipboardCopy,
  TbSelectAll,
  TbCut,
  TbClipboardText,
  TbMenuDeep,
  TbArrowsMaximize,
  TbArrowsMinimize,
} from 'react-icons/tb';
import { PiFloppyDisk, PiCheckSquareOffset } from 'react-icons/pi';
import { AppState, Language } from '../../types';
import { api } from '../../api';
import { PageHeader, Button, Badge, Card, useToast } from '../../shared/ui';
import { WasmValidator, ValidationResult } from '../../features/wasm-validator/wasm-validator';
import { setupMonacoEditor } from '../../features/monaco-setup/monaco-setup';
import { t } from '../../i18n';

interface ConfigEditorPageProps {
  state: AppState | null;
  onSelectProfile?: (profileName: string) => void;
}

const EditorSkeletonLoader: React.FC<{ lang: Language }> = ({ lang }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-card)',
      color: 'var(--text-muted)',
      gap: '16px',
      padding: '30px',
      zIndex: 5,
    }}
  >
    <div className="ui-editor-spinner" />
    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
      {t(lang, 'configEditor.loading')}
    </div>
    <div
      style={{
        width: '100%',
        maxWidth: '440px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        marginTop: '6px',
        opacity: 0.75,
      }}
    >
      <div className="ui-editor-skeleton" style={{ height: '11px', width: '38%' }} />
      <div className="ui-editor-skeleton" style={{ height: '11px', width: '68%' }} />
      <div className="ui-editor-skeleton" style={{ height: '11px', width: '52%' }} />
      <div className="ui-editor-skeleton" style={{ height: '11px', width: '82%' }} />
      <div className="ui-editor-skeleton" style={{ height: '11px', width: '44%' }} />
    </div>
  </div>
);

const ConfigEditorPageComponent: React.FC<ConfigEditorPageProps> = ({ state }) => {
  const lang: Language = state?.language || 'ru';
  const toast = useToast();

  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditorMounted, setIsEditorMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordWrap, setWordWrap] = useState(true);
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const validationTimerRef = useRef<any>(null);
  const menuPopupRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // Initialize WASM validator in background
  useEffect(() => {
    WasmValidator.init().catch((err) => {
      console.warn('WASM module init warning:', err);
    });
  }, []);

  // Fetch config content from backend
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getConfig();
      setContent(res.content);
      setInitialContent(res.content);

      // Validate initial content if WASM is ready
      if (WasmValidator.isReady()) {
        const val = WasmValidator.validate(res.content);
        setValidationResult(val);
      }
    } catch (e: any) {
      toast.error(e.message || String(e), t(lang, 'configEditor.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [toast, lang]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, state?.current_profile]);

  const isDirty = content !== initialContent;

  const handleBeforeMount: BeforeMount = (monaco) => {
    setupMonacoEditor(monaco, state?.theme_dark ?? true);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setupMonacoEditor(monaco, state?.theme_dark ?? true);
    setIsEditorMounted(true);

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column,
      });
    });

    // Keyboard shortcut inside Monaco: Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current();
    });

    editor.layout();
    setTimeout(() => {
      editor.layout();
    }, 60);

    // Validate once editor mounts and WASM is ready
    if (content && WasmValidator.isReady()) {
      setValidationResult(WasmValidator.validate(content));
    }
  };

  // Window resize handler for Monaco layout
  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle layout updates when toggling fullscreen
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.layout();
      const timer = setTimeout(() => {
        editorRef.current?.layout();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen]);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // Click outside to close dropdown menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuPopupRef.current &&
        !menuPopupRef.current.contains(e.target as Node) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Keep a stable ref to handleSave to avoid stale closure in global keydown
  const handleSaveRef = useRef<() => void>(() => {});

  // Global Ctrl+S shortcut handler — uses ref to avoid stale closure
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleContentChange = (value: string | undefined) => {
    const nextVal = value || '';
    setContent(nextVal);

    // Debounced real-time validation via WASM
    if (validationTimerRef.current) {
      clearTimeout(validationTimerRef.current);
    }
    validationTimerRef.current = setTimeout(() => {
      if (WasmValidator.isReady()) {
        const res = WasmValidator.validate(nextVal);
        setValidationResult(res);
      }
    }, 150);
  };

  const handleFormat = () => {
    if (!editorRef.current) return;
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      setContent(formatted);
      editorRef.current.setValue(formatted);
      toast.info(t(lang, 'configEditor.formatted'));
    } catch (e: any) {
      toast.error(
        `${t(lang, 'configEditor.formatError')}: ${e.message}`
      );
    }
  };

  const handleCopy = () => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      navigator.clipboard.writeText(currentValue);
    } else {
      navigator.clipboard.writeText(content);
    }
    toast.success(t(lang, 'configEditor.copied'));
  };

  const handleSelectAll = () => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    editorRef.current.setSelection(model.getFullModelRange());
    editorRef.current.focus();
  };

  const handleCut = () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    const model = editorRef.current.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      editorRef.current.executeEdits('menu-cut', [{ range: selection, text: '' }]);
      editorRef.current.focus();
    }
  };

  const handlePaste = () => {
    if (!editorRef.current) return;
    const position = editorRef.current.getPosition();
    if (!position) return;
    navigator.clipboard.readText().then((text) => {
      if (!editorRef.current || !text) return;
      const selection = editorRef.current.getSelection() || {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };
      editorRef.current.executeEdits('menu-paste', [{ range: selection, text }]);
      editorRef.current.focus();
    }).catch((err) => {
      console.error('Clipboard paste failed:', err);
    });
  };

  const handleRevert = () => {
    if (!isDirty) return;
    setContent(initialContent);
    if (editorRef.current) {
      editorRef.current.setValue(initialContent);
    }
    toast.info(t(lang, 'configEditor.reverted'));
  };

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    try {
      await api.saveConfig(content);
      setInitialContent(content);
      toast.success(t(lang, 'configEditor.saved'));
    } catch (e: any) {
      toast.error(
        `${t(lang, 'configEditor.saveError')}: ${e.message || String(e)}`
      );
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isSaving, content, lang, toast]);

  // Keep ref in sync so the global keydown handler always calls the latest version
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Try to parse line number from error message to jump to it
  const parsedErrorLine = useMemo(() => {
    if (!validationResult || validationResult.isValid || !validationResult.error) return null;
    const match = validationResult.error.match(/(?:line|строк[ае]|at line)\s*(\d+)/i);
    if (match && match[1]) {
      const lineNum = parseInt(match[1], 10);
      if (!isNaN(lineNum) && lineNum > 0) return lineNum;
    }
    // Try to find offset in JSON error "at position X"
    const posMatch = validationResult.error.match(/at position\s*(\d+)/i);
    if (posMatch && posMatch[1]) {
      const pos = parseInt(posMatch[1], 10);
      if (!isNaN(pos) && pos >= 0) {
        const upToPos = content.slice(0, pos);
        return upToPos.split('\n').length;
      }
    }
    return null;
  }, [validationResult, content]);

  const jumpToError = (line: number) => {
    if (!editorRef.current) return;
    editorRef.current.revealLineInCenter(line);
    editorRef.current.setPosition({ lineNumber: line, column: 1 });
    editorRef.current.focus();
  };

  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const sizeKB = useMemo(() => (new Blob([content]).size / 1024).toFixed(1), [content]);
  const currentProfile = state?.current_profile || 'default';
  const wasmVersion = WasmValidator.getVersion();
  const displayWasmVersion = wasmVersion
    ? wasmVersion.startsWith('v') ? wasmVersion : `v${wasmVersion}`
    : '';

  const editorCard = (
    <Card
      padding="none"
      style={{
        flex: 1,
        height: '100%',
        minHeight: isFullscreen ? 0 : '480px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: isFullscreen ? '0 12px 48px rgba(0,0,0,0.6)' : 'var(--shadow-md)',
      }}
    >
          {isFullscreen && (
            <button
              type="button"
              className="ui-editor-floating-minimize-btn"
              onClick={() => setIsFullscreen(false)}
              title={t(lang, 'configEditor.exitFullscreen')}
            >
              <TbArrowsMinimize size={18} />
            </button>
          )}
        {/* Editor Sub-Toolbar */}
        <div className="ui-editor-subbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '12px' }}>
              {lineCount} {t(lang, 'configEditor.lines')}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>•</span>
            <span>{sizeKB} KB</span>
            <span style={{ color: 'var(--text-dim)' }}>•</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: '11px' }}>
              sing-box.schema.json
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className={`ui-editor-toolbar-btn ${wordWrap ? 'ui-editor-toolbar-btn--active' : ''}`}
              onClick={() => setWordWrap(!wordWrap)}
              title={t(lang, 'configEditor.wrapTitle')}
            >
              <WrapText size={12} />
              <span>{t(lang, 'configEditor.wrap')}</span>
            </button>
            <button
              type="button"
              className={`ui-editor-toolbar-btn ${minimapEnabled ? 'ui-editor-toolbar-btn--active' : ''}`}
              onClick={() => setMinimapEnabled(!minimapEnabled)}
              title={t(lang, 'configEditor.minimapTitle')}
            >
              <Map size={12} />
              <span>{t(lang, 'configEditor.minimap')}</span>
            </button>
          </div>
        </div>

        {/* Monaco Editor Container */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0, width: '100%', height: '100%' }}>
          <Editor
            height="100%"
            width="100%"
            defaultLanguage="json"
            value={content}
            theme={state?.theme_dark ? 'singbox-dark' : 'singbox-light'}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            loading={<EditorSkeletonLoader lang={lang} />}
            onChange={handleContentChange}
            options={{
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              tabSize: 2,
              minimap: { enabled: minimapEnabled, maxColumn: 80 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              formatOnPaste: true,
              wordWrap: wordWrap ? 'on' : 'off',
              renderLineHighlight: 'all',
              fixedOverflowWidgets: true,
            }}
          />

          {(isLoading || !isEditorMounted) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                transition: 'opacity 0.25s ease-in-out',
              }}
            >
              <EditorSkeletonLoader lang={lang} />
            </div>
          )}
        </div>

        {/* Validation Status Line */}
        <div
          style={{
            padding: '6px 16px',
            background: validationResult && !validationResult.isValid ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card-subtle)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--text-muted)',
            flexShrink: 0,
            minHeight: '30px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '12px' }}>
            {validationResult ? (
              validationResult.isValid ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--success)',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>
                    {displayWasmVersion ? `sing-box ${displayWasmVersion} · ` : ''}
                    {t(lang, 'configEditor.valid')}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--danger)',
                    fontWeight: 600,
                    minWidth: 0,
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={validationResult.error || undefined}
                  >
                    {validationResult.error}
                  </span>
                  {parsedErrorLine !== null && (
                    <button
                      type="button"
                      onClick={() => jumpToError(parsedErrorLine)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 7px',
                        color: 'var(--danger)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                      title={`${t(lang, 'configEditor.jumpToLine')} ${parsedErrorLine}`}
                    >
                      <span>{`${t(lang, 'configEditor.line')} ${parsedErrorLine}`}</span>
                      <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              )
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>
                {t(lang, 'configEditor.validating')}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          {/* Left Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Square Fullscreen Toggle Button */}
            <button
              type="button"
              className="ui-editor-action-icon-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? t(lang, 'configEditor.exitFullscreen') : t(lang, 'configEditor.fullscreen')}
            >
              {isFullscreen ? <TbArrowsMinimize size={18} /> : <TbArrowsMaximize size={18} />}
            </button>

            {/* Save Button */}
            <Button
              size="sm"
              variant={isDirty ? 'primary' : 'secondary'}
              iconLeft={<PiFloppyDisk size={16} />}
              loading={isSaving}
              onClick={handleSave}
              disabled={!isDirty || isLoading}
              title={t(lang, 'configEditor.saveTitle')}
            >
              {t(lang, 'common.save')}
            </Button>

            {/* Fused Menu + Format Group */}
            <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
              <button
                type="button"
                ref={menuBtnRef}
                className={`ui-editor-menu-btn ${isMenuOpen ? 'ui-editor-menu-btn--open' : ''}`}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title="Дополнительно"
              >
                <TbMenuDeep size={20} />
              </button>

              <button
                type="button"
                className="ui-editor-format-btn"
                onClick={handleFormat}
                disabled={isLoading}
                title={t(lang, 'configEditor.formatTitle')}
              >
                <PiCheckSquareOffset size={16} />
                <span>{t(lang, 'configEditor.format')}</span>
              </button>

              {/* Dropdown Popup Menu */}
              {isMenuOpen && (
                <div
                  ref={menuPopupRef}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    minWidth: '205px',
                    zIndex: 99999,
                    padding: '5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    className="ui-editor-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleCopy();
                    }}
                  >
                    <TbClipboardCopy size={16} style={{ color: 'var(--text-muted)' }} />
                    <span>{t(lang, 'configEditor.copyAllContent')}</span>
                  </button>

                  <button
                    type="button"
                    className="ui-editor-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleSelectAll();
                    }}
                  >
                    <TbSelectAll size={16} style={{ color: 'var(--text-muted)' }} />
                    <span>{t(lang, 'configEditor.selectAll')}</span>
                  </button>

                  <button
                    type="button"
                    className="ui-editor-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleCut();
                    }}
                  >
                    <TbCut size={16} style={{ color: 'var(--text-muted)' }} />
                    <span>{t(lang, 'configEditor.cutSelection')}</span>
                  </button>

                  <button
                    type="button"
                    className="ui-editor-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      handlePaste();
                    }}
                  >
                    <TbClipboardText size={16} style={{ color: 'var(--text-muted)' }} />
                    <span>{t(lang, 'configEditor.pasteFromClipboard')}</span>
                  </button>

                  {isDirty && (
                    <>
                      <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                      <button
                        type="button"
                        className="ui-editor-dropdown-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          handleRevert();
                        }}
                      >
                        <RotateCcw size={15} style={{ color: 'var(--text-muted)' }} />
                        <span>{t(lang, 'configEditor.revert')}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            {isDirty && (
              <Badge size="xs" variant="warning">
                {t(lang, 'configEditor.unsaved')}
              </Badge>
            )}
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-dim)' }}>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>UTF-8</span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>JSON</span>
          </div>
        </div>
      </Card>
  );

  return (
    <div
      className="main-view"
      style={{
        paddingBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <PageHeader
        icon={<FileCode2 size={22} />}
        title={t(lang, 'configEditor.title')}
        description={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span className="ui-editor-profile-badge" style={{ pointerEvents: 'none' }}>
              <Layers size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600 }}>{currentProfile}</span>
            </span>
            <span>{t(lang, 'configEditor.editingDesc')}</span>
          </div>
        }
      />

      {isFullscreen
        ? createPortal(
            <div className="ui-editor-container-fullscreen">
              {editorCard}
            </div>,
            document.body
          )
        : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              {editorCard}
            </div>
          )}
    </div>
  );
};

export const ConfigEditorPage = React.memo<ConfigEditorPageProps>(ConfigEditorPageComponent, (prev, next) => {
  return (
    prev.state?.language === next.state?.language &&
    prev.state?.current_profile === next.state?.current_profile &&
    prev.state?.theme_dark === next.state?.theme_dark
  );
});
ConfigEditorPage.displayName = 'ConfigEditorPage';
