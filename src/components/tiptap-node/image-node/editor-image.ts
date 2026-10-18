import { Image } from '@tiptap/extension-image'
import { safeImageSrc } from '@/app/lib/safeUrl'

const imageWidth = (value: unknown) => {
  const width = Number(value)
  return Number.isFinite(width) && width >= 32 && width <= 1600 ? Math.round(width) : null
}

export const EditorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, parseHTML: element => imageWidth(element.getAttribute('width')), renderHTML: attributes => imageWidth(attributes.width) ? { width: imageWidth(attributes.width) } : {} },
      height: { default: null, rendered: false },
      imageAlign: { default: 'left', parseHTML: element => ['center', 'right'].includes(element.dataset.imageAlign || '') ? element.dataset.imageAlign : 'left', renderHTML: attributes => ({ 'data-image-align': attributes.imageAlign }) },
      imageLayout: { default: 'block', parseHTML: element => element.dataset.imageLayout === 'heading' ? 'heading' : 'block', renderHTML: attributes => ({ 'data-image-layout': attributes.imageLayout }) },
      imageCaption: { default: '', parseHTML: element => (element.dataset.imageCaption || '').slice(0, 300), renderHTML: attributes => attributes.imageCaption ? { 'data-image-caption': String(attributes.imageCaption).slice(0, 300) } : {} },
    }
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const container = document.createElement('div')
      const wrapper = document.createElement('div')
      const image = document.createElement('img')
      const imageFrame = document.createElement('div')
      const caption = document.createElement('div')
      const handle = document.createElement('span')
      container.dataset.resizeContainer = ''
      wrapper.dataset.resizeWrapper = ''
      handle.dataset.resizeHandle = 'bottom-right'
      handle.setAttribute('aria-hidden', 'true')
      image.draggable = false
      imageFrame.className = 'editor-image-frame'
      caption.className = 'editor-image-caption'
      container.append(wrapper)
      wrapper.append(imageFrame, caption)
      imageFrame.append(image, handle)
      let current = node
      let drag: { id: number; x: number; width: number; maximum: number } | null = null
      const sync = () => {
        const attrs = current.attrs
        const src = safeImageSrc(attrs.src)
        if (src) { if (image.getAttribute('src') !== src) image.src = src }
        else image.removeAttribute('src')
        image.alt = attrs.alt || ''
        if (attrs.title) image.title = attrs.title
        else image.removeAttribute('title')
        image.style.width = imageWidth(attrs.width) ? `${imageWidth(attrs.width)}px` : ''
        image.style.height = 'auto'
        container.dataset.imageAlign = attrs.imageAlign
        container.dataset.imageLayout = attrs.imageLayout
        caption.textContent = String(attrs.imageCaption || '').slice(0, 300)
        caption.hidden = !caption.textContent
      }
      const finish = (commit: boolean) => {
        if (!drag) return
        const { id } = drag
        const width = imageWidth(image.getBoundingClientRect().width)
        drag = null
        document.removeEventListener('keydown', key)
        container.dataset.resizeState = 'false'
        if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id)
        const position = getPos()
        if (commit && editor.isEditable && position !== undefined && width) editor.chain().setNodeSelection(position).updateAttributes('image', { width, height: null }).run()
        else sync()
      }
      const down = (event: PointerEvent) => {
        if (!editor.isEditable || !event.isPrimary || event.button !== 0 || drag) return
        event.preventDefault()
        event.stopPropagation()
        drag = { id: event.pointerId, x: event.clientX, width: image.getBoundingClientRect().width, maximum: Math.min(1600, container.parentElement!.clientWidth * (current.attrs.imageLayout === 'heading' && container.nextElementSibling?.matches('h1,h2,h3,h4,h5,h6') ? .35 : 1)) }
        handle.setPointerCapture(event.pointerId)
        document.addEventListener('keydown', key)
        container.dataset.resizeState = 'true'
      }
      const move = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return
        if (!editor.isEditable) { finish(false); return }
        image.style.width = `${Math.round(Math.max(32, Math.min(drag.maximum, drag.width + event.clientX - drag.x)))}px`
      }
      const up = (event: PointerEvent) => { if (event.pointerId === drag?.id) finish(true) }
      const cancel = () => finish(false)
      const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag) { event.preventDefault(); finish(false) } }
      handle.addEventListener('pointerdown', down)
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', cancel)
      handle.addEventListener('lostpointercapture', cancel)
      sync()
      return {
        dom: container,
        update(updated) { if (updated.type !== node.type) return false; current = updated; sync(); return true },
        selectNode() { container.classList.add('ProseMirror-selectednode') },
        deselectNode() { container.classList.remove('ProseMirror-selectednode') },
        stopEvent(event) { return event.target === handle },
        ignoreMutation(mutation) { return mutation.type !== 'selection' },
        destroy() {
          drag = null
          handle.removeEventListener('pointerdown', down)
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
          handle.removeEventListener('pointercancel', cancel)
          handle.removeEventListener('lostpointercapture', cancel)
          document.removeEventListener('keydown', key)
        },
      }
    }
  },
})
