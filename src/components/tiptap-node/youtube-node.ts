import { Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { parseYoutubeEmbed, youtubeEmbedUrl } from '@/app/lib/youtube'

const startTime = (value: unknown) => /^\d{1,5}$/.test(String(value)) && Number(value) <= 86400 ? Number(value) : 0

export const EditorYouTube = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      videoId: { default: null, rendered: false, parseHTML: element => element.dataset.youtubeId },
      start: { default: 0, rendered: false, parseHTML: element => startTime(element.dataset.youtubeStart) },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-youtube-id]', getAttrs: element => /^[\w-]{11}$/.test(element.dataset.youtubeId || '') ? {} : false }]
  },
  renderHTML({ node }) {
    const id = /^[\w-]{11}$/.test(node.attrs.videoId || '') ? node.attrs.videoId : ''
    const start = startTime(node.attrs.start)
    return ['div', { 'data-youtube-id': id, ...(start ? { 'data-youtube-start': start } : {}) }, ['a', { href: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}` }, '在 YouTube 观看']]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'editor-youtube'
      dom.dataset.youtubeId = node.attrs.videoId
      if (/^[\w-]{11}$/.test(node.attrs.videoId || '')) {
        const frame = document.createElement('iframe')
        frame.src = youtubeEmbedUrl(node.attrs.videoId, startTime(node.attrs.start))
        frame.title = 'YouTube 视频'
        frame.allowFullscreen = true
        frame.referrerPolicy = 'strict-origin-when-cross-origin'
        frame.allow = 'encrypted-media; picture-in-picture; fullscreen'
        frame.loading = 'lazy'
        dom.append(frame)
      }
      return { dom }
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handlePaste: (view, event) => {
      const { selection, schema } = view.state
      if (!this.editor.isEditable || !selection.empty || selection.$from.parent.type.name !== 'paragraph' || selection.$from.parent.content.size !== 0) return false
      const value = event.clipboardData?.getData('text/plain').trim() || event.clipboardData?.getData('text/html').trim() || ''
      if (!value.startsWith('<')) return false
      const video = parseYoutubeEmbed(value)
      if (!video) return false
      view.dispatch(view.state.tr.replaceSelectionWith(schema.nodes.youtube.create({ videoId: video.id, start: video.start })).scrollIntoView())
      return true
    } } })]
  },
})
