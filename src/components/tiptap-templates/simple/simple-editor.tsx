"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor, useEditorState, useCurrentEditor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { FindAndReplace } from "@tiptap/extension-find-and-replace"
import { Selection } from "@tiptap/extensions"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"
import { SearchIcon } from "@/components/tiptap-icons/search-icon"
import {AsyncSearchPanel} from "./async-search-panel"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"

// --- Components ---

// --- Lib ---
import { MAX_FILE_SIZE } from "@/lib/tiptap-utils"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"

import {Table2, CornerDownLeft, ChevronLeft, ChevronRight} from 'lucide-react'
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/tiptap-ui-primitive/dropdown-menu'
import {TableKit} from '@tiptap/extension-table'
import {isRichText, RICH_TEXT_MARKER, sanitizeRichText} from '@/app/lib/richText'
import '@/styles/_variables.scss'
import '@/styles/_keyframe-animations.scss'
export interface SimpleEditorProps {
  parseLegacy?: (value:string)=>string;
  value: string; onChange: (value:string)=>void;
  uploadImage: (file:File)=>Promise<string>; onError:(message:string)=>void; onBusy:(busy:boolean)=>void;
  registerImageInsert?: (insert:(url:string,alt:string)=>void)=>void;
}
const initialHTML = (value:string, parseLegacy?: (value:string)=>string) => sanitizeRichText(isRichText(value) ? value : parseLegacy ? parseLegacy(value) : value);

const SEARCH_AND_REPLACE_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  block: "center",
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  onSearchAndReplaceClick,
  isSearchAndReplaceOpen,
  searchAndReplaceButtonRef,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  onSearchAndReplaceClick: () => void
  isSearchAndReplaceOpen: boolean
  searchAndReplaceButtonRef: React.RefObject<HTMLButtonElement>
  isMobile: boolean
}) => {
  return (
    <>

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <BlockquoteButton />
        <CodeBlockButton />
        <ExitCodeButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text={isMobile ? undefined : "图片"} />
        <TableMenu />
      </ToolbarGroup>


      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <Button aria-label="查找替换" tooltip="查找替换"
          ref={searchAndReplaceButtonRef}
          aria-expanded={isSearchAndReplaceOpen}
          data-active-state={isSearchAndReplaceOpen ? "on" : "off"}
          onClick={onSearchAndReplaceClick}
        ><SearchIcon className="tiptap-button-icon"/></Button>

      </ToolbarGroup>
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" aria-label="返回编辑工具" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor(props: SimpleEditorProps) {
  const current = useRef(props); current.current = props;
  const lastValue = useRef(props.value);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.onBusy(false)}},[]);
  const isMobile = useIsBreakpoint()

  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const [isSearchAndReplaceOpen, setIsSearchAndReplaceOpen] = useState(false)
  const [searchLoaded, setSearchLoaded] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const toolbarFrame = useRef<HTMLDivElement>(null)
  const [scrollEdges,setScrollEdges] = useState({overflow:false,left:false,right:false})
  useEffect(()=>{
    const bar=toolbarRef.current,frame=toolbarFrame.current;if(!bar || !frame)return;
    const measure=()=>{const overflow=bar.scrollWidth>frame.clientWidth+1;setScrollEdges(previous=>{const next={overflow,left:bar.scrollLeft>1,right:bar.scrollLeft+bar.clientWidth<bar.scrollWidth-1};return JSON.stringify(previous)===JSON.stringify(next)?previous:next})};
    const resize=new ResizeObserver(measure);resize.observe(bar);resize.observe(frame);
    const changes=new MutationObserver(measure);changes.observe(bar,{childList:true,subtree:true});
    bar.addEventListener('scroll',measure,{passive:true});measure();
    return()=>{resize.disconnect();changes.disconnect();bar.removeEventListener('scroll',measure)};
  },[])
  useEffect(()=>{if(toolbarRef.current)toolbarRef.current.scrollLeft=0},[mobileView])
  const scrollTools=(direction:number)=>{const bar=toolbarRef.current;if(bar)bar.scrollBy({left:direction*Math.max(120,bar.clientWidth*.7),behavior:'instant'})}
  const searchAndReplaceButtonRef = useRef<HTMLButtonElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      transformPastedHTML: sanitizeRichText,
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "文章正文",
        role: "textbox",
        "aria-multiline": "true",
        class: "simple-editor",
      },
    },
    extensions: [
      TableKit.configure({table:{resizable:false}}),
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      FindAndReplace.configure({
        searchDebounceMs: 500,
        injectCSS: false,
      }),
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 1,
        upload: async (file) => {
          const url = await current.current.uploadImage(file);
          if (!alive.current) throw new Error('编辑器已关闭');
          return url;
        },
        onError: (error) => current.current.onError(error.message || "图片上传失败，请重试"),
      }),
    ],
    content: initialHTML(props.value, props.parseLegacy),
    onUpdate: ({editor}) => {
      const next = RICH_TEXT_MARKER + '\n' + editor.getHTML();
      lastValue.current = next;
      current.current.onChange(next);
      let pending = false;
      editor.state.doc.descendants(node=>{if(node.type.name === 'imageUpload') pending=true});
      current.current.onBusy(pending);
    },
  })

  useEffect(()=>{
    if(editor && props.value !== lastValue.current){
      editor.commands.setContent(initialHTML(props.value, props.parseLegacy),{emitUpdate:false});
      lastValue.current = props.value;
    }
  },[editor,props.value,props.parseLegacy]);
  useEffect(()=>{
    if(!editor) return;
    let pending=false;editor.state.doc.descendants(node=>{if(node.type.name==='imageUpload')pending=true});current.current.onBusy(pending);
    props.registerImageInsert?.((url,alt)=>{
      if(!editor.isDestroyed) editor.chain().focus().setImage({src:url,alt}).run();
    });
  },[editor,props.registerImageInsert]);

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main")
    }
  }, [isMobile, mobileView])

  const openSearchAndReplace = useCallback(() => {
    setMobileView("main")
    setSearchLoaded(true)
    setIsSearchAndReplaceOpen(true)
  }, [])

  const closeSearchAndReplace = useCallback(() => {
    setIsSearchAndReplaceOpen(false)
    searchAndReplaceButtonRef.current?.focus()
  }, [])

  const toggleSearchAndReplace = useCallback(() => {
    if (isSearchAndReplaceOpen) {
      closeSearchAndReplace()
      return
    }

    openSearchAndReplace()
  }, [closeSearchAndReplace, isSearchAndReplaceOpen, openSearchAndReplace])

  return (
    <div className="simple-editor-wrapper mooncci-tiptap-editor" onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"){event.preventDefault();openSearchAndReplace()}}}>
      <EditorContext.Provider value={{ editor }}>
        <div className="editor-toolbar-frame" ref={toolbarFrame} data-compact={isMobile} data-view={mobileView} data-overflow={scrollEdges.overflow && !isMobile && mobileView === "main"}>
        {scrollEdges.overflow&&!isMobile&&mobileView === "main"&&<button type="button" className="editor-scroll-control" aria-label="查看左侧工具" disabled={!scrollEdges.left} onMouseDown={e=>e.preventDefault()} onClick={()=>scrollTools(-1)}><ChevronLeft size={18}/></button>}
        <Toolbar
          ref={toolbarRef}
          onKeyDown={e=>{if(e.key === "Escape" && mobileView !== "main"){e.preventDefault();setMobileView("main");editor?.commands.focus()}}}

        >
          {mobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              onSearchAndReplaceClick={toggleSearchAndReplace}
              isSearchAndReplaceOpen={isSearchAndReplaceOpen}
              searchAndReplaceButtonRef={searchAndReplaceButtonRef}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>
        {scrollEdges.overflow&&!isMobile&&mobileView === "main"&&<button type="button" className="editor-scroll-control" aria-label="查看右侧工具" disabled={!scrollEdges.right} onMouseDown={e=>e.preventDefault()} onClick={()=>scrollTools(1)}><ChevronRight size={18}/></button>}
        </div>

        {searchLoaded && <AsyncSearchPanel
          enableShortcut={false}
          className="simple-editor-search-and-replace"
          open={isSearchAndReplaceOpen}
          onOpen={openSearchAndReplace}
          onClose={closeSearchAndReplace}
          scrollIntoViewOptions={SEARCH_AND_REPLACE_SCROLL_OPTIONS}
        />}

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}

function TableMenu({text}:{text?:string}){
 const {editor}=useCurrentEditor();
 const active=useEditorState({editor,selector:({editor})=>editor?.isActive('table')});
 return <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button tooltip="表格" aria-label="表格"><Table2 className="tiptap-button-icon"/>{text&&<span>{text}</span>}</Button></DropdownMenuTrigger><DropdownMenuContent collisionPadding={12}>
 <DropdownMenuItem onSelect={()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}>插入表格</DropdownMenuItem>
 {active&&<><DropdownMenuItem onSelect={()=>editor?.chain().focus().addRowAfter().run()}>添加行</DropdownMenuItem><DropdownMenuItem onSelect={()=>editor?.chain().focus().addColumnAfter().run()}>添加列</DropdownMenuItem><DropdownMenuItem onSelect={()=>editor?.chain().focus().deleteRow().run()}>删除行</DropdownMenuItem><DropdownMenuItem onSelect={()=>editor?.chain().focus().deleteColumn().run()}>删除列</DropdownMenuItem><DropdownMenuItem onSelect={()=>editor?.chain().focus().deleteTable().run()}>删除表格</DropdownMenuItem></>}
 </DropdownMenuContent></DropdownMenu>;
}
function ExitCodeButton(){
 const {editor}=useCurrentEditor();
 const active=useEditorState({editor,selector:({editor})=>editor?.isActive('codeBlock')});
 return active ? <Button tooltip="退出代码块，继续正文" aria-label="退出代码块" onClick={()=>editor?.chain().focus().exitCode().run()}><CornerDownLeft className="tiptap-button-icon"/></Button> : null;
}

