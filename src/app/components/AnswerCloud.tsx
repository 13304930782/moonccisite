import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type CloudWord = { text: string; count: number };
type PlacedWord = CloudWord & { size: number; x: number; y: number };
type Box = { width: number; height: number; x: number; y: number };

export function AnswerCloud({ words }: { words: CloudWord[] }) {
  const sorted = useMemo(() => [...words].sort((a, b) => b.count - a.count), [words]);
  const container = useRef<HTMLDivElement>(null);
  const elements = useRef<(HTMLSpanElement | null)[]>([]);
  const [layout, setLayout] = useState<{ words: PlacedWord[]; height: number } | null>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root || !sorted.length) return;
    let active = true;
    const update = () => {
      if (!active || !root.clientWidth) return;
      const width = root.clientWidth, max = sorted[0].count, min = sorted[sorted.length - 1].count;
      const sizes = sorted.map(word => max === min ? 40 : 14 + 26 * (word.count - min) / (max - min));
      sizes.forEach((size, index) => { if (elements.current[index]) elements.current[index]!.style.fontSize = `${size}px`; });
      const boxes = sizes.map((_, index) => {
        const element = elements.current[index];
        if (!element) return { width: 0, height: 0 };
        return { width: element.offsetWidth, height: element.offsetHeight };
      });
      function attempt(height: number) {
        const placed: Box[] = [];
        for (const box of boxes) {
          let found: Box | undefined;
          for (let angle = 0; angle <= Math.PI * 24; angle += .08) {
            const radius = angle * 4;
            const candidate = { ...box, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius };
            if (candidate.x - box.width / 2 < 0 || candidate.x + box.width / 2 > width || candidate.y - box.height / 2 < 0 || candidate.y + box.height / 2 > height) continue;
            if (placed.some(other => Math.abs(candidate.x - other.x) < (box.width + other.width) / 2 + 4 && Math.abs(candidate.y - other.y) < (box.height + other.height) / 2 + 4)) continue;
            found = candidate; break;
          }
          if (!found) return null;
          placed.push(found);
        }
        return placed;
      }
      let height = 200, positions = attempt(height);
      while (!positions && height < 600) { height += 40; positions = attempt(height); }
      if (!positions) {
        // A dense cloud grows vertically rather than overlapping or hiding responses.
        height = 200 + boxes.reduce((sum, box) => sum + box.height + 8, 0) * 2;
        let y = height / 2;
        positions = boxes.map((box, index) => { if (index) y += boxes[index - 1].height / 2 + box.height / 2 + 8; return { ...box, x: width / 2, y }; });
      }
      setLayout({ height, words: sorted.map((word, index) => ({ ...word, size: sizes[index], x: positions![index].x, y: positions![index].y })) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    void document.fonts.ready.then(update);
    return () => { active = false; observer.disconnect(); };
  }, [sorted]);

  return <div ref={container} className="answer-cloud" style={{ height: layout?.height ?? 200 }}>
    {sorted.map((word, index) => {
      const placement = layout?.words[index];
      return <span key={word.text} ref={element => { elements.current[index] = element; }} className="answer-cloud-word" style={{ left: placement?.x ?? 0, top: placement?.y ?? 0, fontSize: placement?.size ?? 14, visibility: placement ? 'visible' : 'hidden', transform: 'translate(-50%, -50%)' }}><span className="answer-cloud-text" title={word.text}>{word.text}</span><small>{word.count}</small></span>;
    })}
  </div>;
}
