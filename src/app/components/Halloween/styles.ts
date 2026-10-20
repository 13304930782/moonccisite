export const styles = `
.halloween{--hw-orange:#ff7a1a;--hw-soft:#fff0e0;--hw-text:#b35309;--hw-purple:#5b33a6;--hw-dark:#3d2178;--hw-gold:#ffd36b}
.halloween.dark{--hw-soft:rgba(255,122,26,.18);--hw-text:#ffb36b;--hw-purple:#8a63e0;--hw-dark:#2a1856}
.halloween .hw-pumpkin{fill:var(--hw-orange);pointer-events:none;flex:none}
.halloween .site-header .site-brand{position:relative}
.halloween .hw-logo{position:absolute;right:-7px;top:-9px;width:18px;height:18px;pointer-events:none}
.halloween .home-hero{position:relative;isolation:isolate}
.halloween .home-hero> :not(.hw-scene){position:relative;z-index:1}
.halloween .hw-scene{position:absolute;inset:0;pointer-events:none}
.halloween .hw-candy{width:fit-content;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:7px 16px 7px 10px;margin:0 0 22px;border:0;border-radius:999px;background:var(--hw-soft);color:var(--hw-text);font-size:13px;font-weight:600;cursor:pointer}
.halloween .hw-candy:focus-visible{outline:2px solid var(--hw-orange);outline-offset:2px}
.halloween .hw-moon{position:absolute;width:110px;height:110px;right:-18px;top:8px;z-index:2;border-radius:50%;background:radial-gradient(circle at 30% 30%,#e7b957 0 7%,transparent 8%),radial-gradient(circle at 65% 62%,#ebc269 0 12%,transparent 13%),radial-gradient(#fff3d1,#ffd98a)}
.halloween.dark .hw-moon{width:130px;height:130px;top:32px}
.halloween.dark .hw-moon:before{content:"";position:absolute;inset:-30px;z-index:-1;background:radial-gradient(circle,rgba(255,214,120,.3) 40%,transparent 70%);border-radius:50%}
.halloween .hw-web{position:absolute;top:-12px;left:-12px;width:190px;height:190px;fill:none;stroke:rgba(0,0,0,.18);stroke-width:1.2}
.halloween.dark .hw-web{stroke:rgba(255,255,255,.22)}
.halloween .hw-bat{position:absolute;z-index:2;right:160px;top:20px;width:46px;fill:#2a1245;opacity:.8;transform:rotate(-12deg)}
.halloween .hw-bat:nth-of-type(3){right:225px;top:60px;width:30px;transform:rotate(9deg);animation-delay:-7s}
.halloween .hw-bat:nth-of-type(4){right:0;top:80px;width:24px;transform:rotate(-5deg);animation-delay:-13s}
.halloween.dark .hw-bat{fill:#3a2466}
@media(prefers-reduced-motion:no-preference){.halloween .hw-scene[data-moving=true] .hw-bat{animation:hw-drift var(--hw-period) ease-in-out infinite;}}
@keyframes hw-drift{0%,100%{transform:translate(0,0) rotate(-9deg);opacity:.8}50%{transform:translate(-12px,9px) rotate(5deg);opacity:1}}
@media(max-width:767px){.halloween .hw-web{width:120px;height:120px;left:0;top:0}.halloween .hw-moon,.halloween.dark .hw-moon{width:72px;height:72px;right:4px;top:0}.halloween.dark .hw-moon{top:18px}.halloween.dark .hw-moon:before{inset:-16px}.halloween .hw-bat{right:82px;top:14px;width:30px}.halloween .hw-bat~.hw-bat{display:none}}
`;

