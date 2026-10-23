import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { notify } from '../../lib/feedback';
import { reducedMotion } from '../../lib/motionPreference';
import { styles } from './styles';
import { hatGeometry } from './geometry';
import type {FestivalEnvironment} from '../Festivals/lifecycle';

let didFire = false;
function stopCandy() { if (didFire) { confetti.reset(); didFire = false; } }

const pumpkin = '<path d="M12 6c-8-5-15 13-3 15h6C27 19 20 1 12 6Z"/><path d="m12 6 1-4 3-1" fill="none" stroke="currentColor" stroke-width="2"/><path d="m6 11 4 2H6Zm12 0-4 2h4ZM8 16l4 2 4-2" fill="currentColor"/>';
function Pumpkin({ size = 20 }: { size?: number }) {
  return <svg className="hw-pumpkin" style={{color:'var(--hw-dark)'}} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{__html:pumpkin}}/>;
}

export const theme = {className:'halloween', styles, faviconSvg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ff7a1a" color="#3d2178">'+pumpkin+'</svg>', dispose:stopCandy};

function Home({environment}: {environment:FestivalEnvironment}) {
  const button = useRef<HTMLButtonElement>(null);
  const [hero, setHero] = useState<Element | null>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const target = button.current!.closest('.home-hero');
    setHero(target);
    const unsubscribe = environment.observeMotion(target,moving => {setMoving(moving);if (reducedMotion() || document.hidden) stopCandy();});
    return () => {unsubscribe();stopCandy();};
  }, []);
  return <><button ref={button} type="button" className="hw-candy" data-halloween="hero" aria-label="万圣节快乐，点击撒糖" onClick={() => {
    if (reducedMotion()) { notify.success('糖果送到啦'); return; }
    const rect = button.current!.getBoundingClientRect();
    const existingCanvases = new Set(document.querySelectorAll('canvas'));
    didFire = true;
    void confetti({ particleCount: 150, spread: 110, angle: innerWidth < 768 ? -90 : -45, startVelocity: innerWidth < 768 ? 32 : 45, scalar: 1.35, ticks: 240, gravity: 0.8, colors: ['#ff7a1a', '#5b33a6', '#ffd36b'], origin: { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight }, disableForReducedMotion: true });
    document.querySelectorAll('canvas').forEach(canvas => { if (!existingCanvases.has(canvas)) canvas.ariaHidden = 'true'; });
  }}><Pumpkin />万圣节快乐 · 点我讨糖</button>{hero && createPortal(<div className="hw-scene" data-halloween="hero" data-moving={moving} aria-hidden="true"><div className="hw-moon"/><svg className="hw-web" viewBox="0 0 190 190"><path d="M0 0 190 0M0 0 175 73M0 0 134 134M0 0 73 175M0 0 0 190M0 38Q8 30 15 35Q24 25 27 27Q35 21 35 15Q31 7 38 0M0 76Q17 60 29 70Q44 48 54 54Q64 42 70 29Q62 13 76 0M0 114Q23 94 44 105Q65 73 81 81Q96 61 105 44Q96 17 114 0M0 152Q33 122 58 140Q86 98 108 108Q127 80 140 58Q128 24 152 0M0 190Q38 155 73 175Q108 123 134 134Q157 101 175 73Q161 32 190 0"/></svg>{[0,1,2].map(i => <svg key={i} className="hw-bat" style={{ '--hw-period': `${14 + i * 4}s` } as React.CSSProperties} viewBox="0 0 60 30"><path d="M30 13 26 6 23 12C17 8 8 9 0 0c1 12 4 20 12 23 1-7 7-6 10-1 3-6 5-1 8 8 3-9 5-14 8-8 3-5 9-6 10 1 8-3 11-11 12-23-8 9-17 8-23 12l-3-6Z"/></svg>)}</div>, hero)}</>;
}

function Hat() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [body, setBody] = useState<SVGGElement | null>(null);
  useEffect(() => {
    const parent = anchor.current!.parentElement!;
    const find = () => {
      setBody(parent.querySelector<SVGGElement>('.weather-companion-mount svg > g:not([pointer-events]):has(>path)'));
    };
    const observer = new MutationObserver(find);
    observer.observe(parent, { subtree: true, childList: true });
    find();
    return () => observer.disconnect();
  }, []);
  const rear = useRef<SVGGElement>(null);
  const front = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!body) return;
    body.prepend(rear.current!);
    const update = () => {
      const markup = ['', ''];
      for (const face of hatGeometry(Number(body.getAttribute('data-head-pitch')), Number(body.getAttribute('data-head-yaw')))) {
        markup[face.r ? 0 : 1] += `<path d="${face.d}" fill="url(#hw-${face.c})" stroke="url(#hw-${face.c})"/>`;
      }
      rear.current!.innerHTML = markup[0];
      front.current!.innerHTML = markup[1];
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(body, { attributes: true, attributeFilter: ['data-head-pitch', 'data-head-yaw'] });
    return () => { observer.disconnect(); rear.current?.replaceChildren(); front.current?.replaceChildren(); };
  }, [body]);
  return <><span ref={anchor} hidden aria-hidden="true"/>{body && createPortal(<>
    <defs dangerouslySetInnerHTML={{ __html: ['purple', 'orange', 'gold', 'dark'].map(c => `<linearGradient id="hw-${c}" gradientUnits="userSpaceOnUse" x1="50" x2="185"><stop stop-color="color-mix(in srgb,var(--hw-${c}) 45%,black)"/><stop offset=".4" stop-color="var(--hw-${c})"/><stop offset=".5" stop-color="color-mix(in srgb,var(--hw-${c}) ${c === 'gold' ? 35 : 85}%,white)"/><stop offset="1" stop-color="color-mix(in srgb,var(--hw-${c}) 50%,black)"/></linearGradient>`).join('') + '<filter id="hw-felt"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2"/><feComposite in2="SourceGraphic" operator="arithmetic" k1=".3" k3=".85"/></filter>' }}/>
    <g ref={rear} filter="url(#hw-felt)" strokeWidth="2" data-halloween="hat" aria-hidden="true" pointerEvents="none"/>
    <g ref={front} filter="url(#hw-felt)" strokeWidth="2" data-halloween="hat-front" aria-hidden="true" pointerEvents="none"/>
  </>, body)}</>;

}

export default function Decorations({ name, environment }: { name: string; options: Record<string, boolean>; environment:FestivalEnvironment }) {
  if (name === 'global') return null;
  if (name === 'page') return <div data-halloween="page"><Pumpkin/></div>;
  if (name === 'home') return <Home environment={environment}/>;
  if (name === 'hat') return <Hat />;
  return <span className="hw-logo" data-halloween="logo" aria-hidden="true"><Pumpkin size={18}/></span>;
}
