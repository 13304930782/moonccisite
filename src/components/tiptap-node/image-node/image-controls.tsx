import { useI18n } from '../../../app/i18n';
import { useEffect, useState } from 'react'
import { useCurrentEditor, useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { Image, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/tiptap-ui-primitive/popover'

export function ImageControls() {
  const { t } = useI18n();
  const { editor } = useCurrentEditor()
  const selected = useEditorState({ editor, selector: ({ editor }) => {
    const selection = editor?.state.selection
    if (!editor?.isEditable || !(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null
    return { position: selection.from, width: selection.node.attrs.width as number | null, imageAlign: selection.node.attrs.imageAlign as string, imageLayout: selection.node.attrs.imageLayout as string, imageCaption: selection.node.attrs.imageCaption as string }
  } })
  const [open, setOpen] = useState(false)
  useEffect(() => { if (!selected) setOpen(false) }, [selected])
  const [width, setWidth] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [caption, setCaption] = useState<string | null>(null)
  useEffect(() => { setWidth(null); setError('') }, [selected?.position, selected?.width])
  useEffect(() => { setCaption(null) }, [selected?.position, selected?.imageCaption])
  if (!editor || !selected) return null
  const selection = editor.state.selection
  const previous = selection.$from.nodeBefore
  const next = editor.state.doc.nodeAt(selection.to)
  const adjacentHeading = previous?.type.name === 'heading' || next?.type.name === 'heading'
  const update = (attrs: Record<string, unknown>) => editor.chain().updateAttributes('image', attrs).run()
  const headingLayout = () => {
    if (selected.imageLayout === 'heading') { update({ imageLayout: 'block' }); return }
    if (!adjacentHeading || !(selection instanceof NodeSelection)) return
    const attrs = { ...selection.node.attrs, imageLayout: 'heading', imageAlign: 'left', width: 80, height: null }
    if (previous?.type.name === 'heading') {
      const position = selection.from - previous.nodeSize
      const transaction = editor.state.tr.delete(selection.from, selection.to).insert(position, selection.node.type.create(attrs))
      editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, position)))
    } else update(attrs)
  }
  const applyWidth = () => {
    if (width === null) return
    const value = Number(width)
    if (!Number.isFinite(value) || value < 32 || value > 1600) { setError(t("m_1b767db727")); return }
    update({ width: Math.round(value), height: null })
    setWidth(null)
    setError('')
  }
  const applyCaption = () => { if (caption !== null) { update({ imageCaption: caption.trim().slice(0, 300) }); setCaption(null) } }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="editor-image-settings-trigger" aria-label={t("m_75359a4812")}><Image size={16} aria-hidden="true" /><span>{t("m_75359a4812")}</span><ChevronDown size={14} aria-hidden="true" /></button></PopoverTrigger>
    <PopoverContent className="editor-image-controls" align="start" sideOffset={8} collisionPadding={12} aria-label={t("m_b1a73de7f6")} onCloseAutoFocus={event => { event.preventDefault() }}>
      <div className="editor-image-settings-header"><strong>{t("m_75359a4812")}</strong><button type="button" className="editor-image-settings-close" aria-label={t("m_818bfb9ced")} onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div>
      <div className="editor-image-settings-section">
        <span className="editor-image-settings-label">{t("m_246df7d8db")}</span>
        <div className="editor-image-segments" role="group" aria-label={t("m_c08c3589c7")}>
          <button type="button" aria-pressed={selected.width === 80} onClick={() => update({ width: 80, height: null })}>{t("m_e83eda77f6")}</button>
          <button type="button" aria-pressed={selected.width === 320} onClick={() => update({ width: 320, height: null })}>{t("m_a2b3e56f93")}</button>
          <button type="button" aria-pressed={!selected.width} onClick={() => update({ width: null, height: null, imageLayout: 'block' })}>{t("m_f60066ec4b")}</button>
        </div>
        <label className="editor-image-width-field"><span>{t("m_3b730da0ad")}</span><span className="editor-image-width-input"><input aria-label={t("m_39ff6c7c01")} aria-invalid={!!error} type="number" min="32" max="1600" step="1" value={width ?? selected.width ?? ''} placeholder={t("m_7eb336e42c")} onChange={event => { setWidth(event.target.value); setError('') }} onBlur={applyWidth} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyWidth() } }} /><span>px</span></span></label>
        {error && <span className="editor-image-settings-error" role="alert">{error}</span>}
      </div>
      <div className="editor-image-settings-section">
        <span className="editor-image-settings-label">{t("m_29d5eedb72")}</span>
        <div className="editor-image-segments" role="group" aria-label={t("m_1b01af645a")}>
          {(['left', 'center', 'right'] as const).map((align, index) => <button type="button" key={align} aria-pressed={selected.imageAlign === align} disabled={selected.imageLayout === 'heading'} onClick={() => update({ imageAlign: align })}>{[t("m_6548f6b58c"), t("m_4cc3885c18"), t("m_be92a99ec4")][index]}</button>)}
        </div>
        <button className="editor-image-heading-toggle" type="button" aria-pressed={selected.imageLayout === 'heading'} disabled={!adjacentHeading && selected.imageLayout !== 'heading'} title={adjacentHeading ? t("m_dbdd7e7a76") : t("m_5318ba36d7")} onClick={headingLayout}><span>{t("m_d0ac62dca8")}</span><span className="editor-image-toggle-indicator" aria-hidden="true" /></button>
      </div>
      <label className="editor-image-caption-field"><span className="editor-image-settings-label">{t("m_5e137136f6")}</span><textarea aria-label={t("m_5e137136f6")} rows={2} maxLength={300} value={caption ?? selected.imageCaption ?? ''} placeholder={t("m_986a0cfddc")} onChange={event => setCaption(event.target.value)} onBlur={applyCaption} /></label>
    </PopoverContent>
  </Popover>
}
