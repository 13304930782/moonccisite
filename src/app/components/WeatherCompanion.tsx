import { reducedMotion } from '../lib/motionPreference';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CloudSun, Minus, X, CircleHelp } from 'lucide-react';
import GrokBall, {
  type GrokBallEngine,
} from '../../vendor/grok-ball/grok-ball.ts';
import { api } from '../lib/api';
import { useMoonTheme } from '../context/ThemeContext';
import { WeatherCityPicker } from './WeatherCityPicker';
import {
  loadWeatherLocation,
  saveWeatherLocation,
  type WeatherLocationSource,
  type WeatherLocation,
} from '../lib/weatherLocation';
import {
  createCompanionGesture,
  createCompanionPointer,
  reactionEmotion,
  DOUBLE_TAP_MS,
  PET_DURATION_MS,
  ANGRY_DURATION_MS,
  type CompanionReaction,
} from '../lib/companionInteraction';
import '../../styles/weather-companion.css';
// Animation IDs are upstream presets; only the small speech captions are site copy.
const ambientMoments = [
  { id: '00', text: '眯一小会儿，马上回来。' },
  { id: '01', text: '醒啦，继续陪你。' },
  { id: '02', text: '没什么事，就是待在你旁边。' },
  { id: '05', text: '一只眼醒了，另一只还在赖床。' },
  { id: '06', text: '困意偷偷跑来了。' },
  { id: '12', text: '有一点点低落，缓一缓就好。' },
  { id: '15', text: '看累了的话，一起歇歇眼睛。' },
  { id: '17', text: '哎呀，差点忘了刚才想说什么。' },
  { id: '18', text: '有时候，发个呆也挺好。' },
  { id: '21', text: '哼，气鼓鼓一下。' },
  { id: '03', text: '咦，你在看什么？' },
  { id: '04', text: '发一会儿呆。' },
  { id: '10', text: '今天也有值得开心的小事。' },
  { id: '11', text: '让我想想……' },
  { id: '13', text: '哦！发现新东西。' },
  { id: '14', text: '被你发现了。' },
  { id: '16', text: '陪你认真看一会儿。' },
  { id: '19', text: '这样就很好。' },
  { id: '20', text: '脑袋里冒出一个问号。' },
];
type InteractionStats = { date: string; pets: number; hits: number };

type DailyMood = {
  status: 'ready' | 'unavailable' | 'disabled' | 'needs_location';
  date: string;
  city: { name: string; region: string } | null;
  timezone: string;
  weatherSource?: 'amap' | 'open-meteo';
  weather: {
    label: string;
    min: number | null;
    max: number | null;
    dayTemperature?: number | null;
    nightTemperature?: number | null;
  } | null;
  mood: { emotionId: string; name: string; message: string } | null;
  refreshAt: string;
  mode: 'weather' | 'manual';
  overrideEndsAt?: string | null;
};

function isPhoneViewport() {
  const ipad = /iPad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return !ipad && /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent) &&
    matchMedia('(max-width: 640px)').matches;
}

export default function WeatherCompanion() {
  const { theme } = useMoonTheme();
  const { pathname } = useLocation();
  const [phoneViewport, setPhoneViewport] = useState(isPhoneViewport);
  const edgeMode = phoneViewport && /^\/article\/[^/]+/.test(pathname);
  const [edgeVisible, setEdgeVisible] = useState(false);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const media = matchMedia('(max-width: 640px)');
    const sync = () => setPhoneViewport(isPhoneViewport());
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const authPage = ['/login', '/admin-login', '/register', '/forgot-password', '/reset-password', '/complete-registration'].includes(pathname);
  const [inputMood, setInputMood] = useState<'account' | 'password' | null>(null);
  const [ambient, setAmbient] = useState<(typeof ambientMoments)[number] | null>(null);
  const [focusSpeech, setFocusSpeech] = useState('');
  const [ambientSpeech, setAmbientSpeech] = useState('');
  const [displayedEmotion, setDisplayedEmotion] = useState('02');
  const lastMoment = useRef(-1);
  const momentBag = useRef<number[]>([]);
  const passwordFocused = useRef(false);
  const [data, setData] = useState<DailyMood | null>(null);
  const [location, setLocation] = useState<WeatherLocation | null>(
    loadWeatherLocation,
  );
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [cityAttribution, setCityAttribution] = useState<
    'amap' | 'nominatim' | 'geonames' | 'photon' | null
  >(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPosition, setHelpPosition] = useState({ left: 12, top: 12 });
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpPopup = useRef<HTMLDivElement>(null);
  const helpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showHelp() {
    if (helpTimer.current) clearTimeout(helpTimer.current);
    const button = helpButton.current?.getBoundingClientRect();
    const panel = root.current
      ?.querySelector('.weather-companion-panel')
      ?.getBoundingClientRect();
    if (!button || !panel) return;
    const width = Math.min(236, innerWidth - 24);
    const left =
      panel.left - width - 12 >= 12
        ? panel.left - width - 12
        : Math.max(12, Math.min(innerWidth - width - 12, button.right - width));
    setHelpPosition({
      left,
      top: Math.max(12, Math.min(innerHeight - 150, button.top - 126)),
    });
    setHelpOpen(true);
  }
  function hideHelpSoon() {
    if (helpTimer.current) clearTimeout(helpTimer.current);
    helpTimer.current = setTimeout(() => setHelpOpen(false), 180);
  }
  useEffect(() => {
    if (!open) setHelpOpen(false);
  }, [open]);
  useEffect(() => {
    if (!helpOpen) return;
    const outside = (event: PointerEvent) => {
      if (
        !helpButton.current?.contains(event.target as Node) &&
        !helpPopup.current?.contains(event.target as Node)
      )
        setHelpOpen(false);
    };
    const hide = () => setHelpOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setHelpOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [helpOpen]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem('mooncci-companion-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const revealEdge = useCallback(() => {
    if (!edgeMode || collapsed) return;
    setEdgeVisible(true);
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = open ? null : setTimeout(() => {
      edgeTimer.current = null;
      if (!root.current?.contains(document.activeElement)) setEdgeVisible(false);
    }, 4000);
  }, [edgeMode, collapsed, open]);
  useEffect(() => {
    if (!edgeMode || collapsed) {
      if (edgeTimer.current) clearTimeout(edgeTimer.current);
      edgeTimer.current = null;
      setEdgeVisible(false);
      return;
    }
    if (open) {
      if (edgeTimer.current) clearTimeout(edgeTimer.current);
      edgeTimer.current = null;
      setEdgeVisible(true);
    } else if (edgeVisible && !edgeTimer.current) {
      edgeTimer.current = setTimeout(() => {
        edgeTimer.current = null;
        if (!root.current?.contains(document.activeElement)) setEdgeVisible(false);
      }, 4000);
    }
  }, [edgeMode, collapsed, open, edgeVisible]);
  useEffect(() => {
    if (!edgeMode || collapsed) return;
    let anchor = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - anchor) < 24) return;
      anchor = window.scrollY;
      revealEdge();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [edgeMode, collapsed, revealEdge]);
  useEffect(() => () => {
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
  }, []);
  const [reaction, setReaction] = useState<CompanionReaction>(null);
  const [stats, setStats] = useState<InteractionStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const gesture = useRef(createCompanionGesture());
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const angryUntil = useRef(0);
  const [reduced, setReduced] = useState(
    () => reducedMotion(),
  );
  const mount = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLElement>(null);
  const ball = useRef<GrokBallEngine | null>(null);
  const petTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef(createCompanionPointer());
  const pointerClick = useRef(-Infinity);
  const disabled = data?.status === 'disabled';
  const emotion = inputMood === 'password' ? '00' : inputMood === 'account' ? '03' : reactionEmotion(reaction, (data?.mode === 'manual' ? data.mood?.emotionId : ambient?.id) || '02');
  useEffect(() => {
    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    const syncFocus = () => {
      const field = document.activeElement;
      // Inspect field semantics only: never read or retain account/password values.
      const input = field instanceof HTMLInputElement ? field : null;
      const password = Boolean(authPage && input && (input.type === 'password' || /password/.test(input.autocomplete)));
      const account = Boolean(authPage && input && (input.type === 'email' || ['username','email'].includes(input.autocomplete) || input.name === 'username'));
      passwordFocused.current = password;
      setInputMood(password ? 'password' : account ? 'account' : null);
      setAmbientSpeech('');
      clearTimeout(messageTimer);
      setFocusSpeech(password ? '你输密码，我闭眼。' : account ? '我在，慢慢来。' : '');
      if(password || account) messageTimer = setTimeout(() => setFocusSpeech(''), 4200);
    };
    document.addEventListener('focusin', syncFocus);
    document.addEventListener('focusout', syncFocus);
    syncFocus();
    return () => { clearTimeout(messageTimer); passwordFocused.current = false; document.removeEventListener('focusin', syncFocus); document.removeEventListener('focusout', syncFocus); };
  }, [authPage, pathname]);

  useEffect(() => {
    setAmbientSpeech('');
    if (reduced || collapsed || disabled || open || edgeMode || reaction || inputMood || data?.mode === 'manual') return;
    let timer: ReturnType<typeof setTimeout>;
    let restore: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(play, 28000 + Math.random() * 27000); };
    const play = () => {
      const active = document.activeElement;
      if (document.hidden || active?.matches('input,textarea,select,[contenteditable="true"]')) { schedule(); return; }
      // Shuffle a complete round so every preset appears before any repeats.
      if (!momentBag.current.length) {
        const indices = ambientMoments.map((_, index) => index);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        if (indices[indices.length - 1] === lastMoment.current) {
          [indices[0], indices[indices.length - 1]] = [indices[indices.length - 1], indices[0]];
        }
        momentBag.current = indices;
      }
      const index = momentBag.current.pop()!;
      lastMoment.current = index;
      setAmbient(ambientMoments[index]);
      setAmbientSpeech(ambientMoments[index].text);
      // Both particle effects come directly from the upstream SDK.
      const id = ambientMoments[index].id;
      if (['02','03','10','13','14','19'].includes(id)) ball.current?.spin(1);
      else if (['11','16','20'].includes(id)) ball.current?.bounce();
      if (id === '10') ball.current?.burst(12);
      restore = setTimeout(() => setAmbientSpeech(''), 5500);
      schedule();
    };
    const hide = () => { if(document.hidden) { clearTimeout(timer); clearTimeout(restore); setAmbientSpeech(''); } else { clearTimeout(timer); schedule(); } };
    schedule(); document.addEventListener('visibilitychange', hide);
    return () => { clearTimeout(timer); clearTimeout(restore); document.removeEventListener('visibilitychange', hide); };
  }, [reduced, collapsed, disabled, open, edgeMode, reaction, inputMood, data?.mode, pathname]);
  const moodName =
    data?.mood?.name ||
    (!location ? '选个城市' : loaded ? '稍作等待' : '看看天气');
  function selectLocation(
    value: WeatherLocation | null,
    source: WeatherLocationSource = 'manual',
  ) {
    const saved = saveWeatherLocation(value, source);
    setData(null);
    setLoaded(false);
    setLocation(value);
    return saved;
  }

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(reducedMotion());
    preference.addEventListener('change', change);
    window.addEventListener('mooncci:motion-change', change);
    return () => { preference.removeEventListener('change', change); window.removeEventListener('mooncci:motion-change', change); };
  }, []);

  useEffect(() => {
    let stopped = false,
      controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined,
      next = 0;
    async function refresh() {
      if (stopped || controller || document.hidden) return;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await api('/weather-mood', {
          method: 'POST',
          body: JSON.stringify({ location }),
          signal: controller.signal,
          cache: 'no-store',
        });
        if (stopped) return;
        const result = response.data as DailyMood;
        if (
          !result ||
          !['ready', 'unavailable', 'disabled', 'needs_location'].includes(
            result.status,
          )
        )
          throw new Error('Invalid weather');
        setData(result);
        // Poll our cached endpoint for administrative overrides, not the weather provider.
        next = Math.min(
          Date.now() + 60000,
          Date.parse(result.refreshAt),
          result.overrideEndsAt ? Date.parse(result.overrideEndsAt) : Infinity,
        );
      } catch {
        if (stopped) return;
        setData(null);
        next = Date.now() + 15 * 60000;
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (!stopped) {
          setLoaded(true);
          const delay = Math.max(
            1000,
            Math.min(
              86400000,
              (Number.isFinite(next) ? next : Date.now() + 15 * 60000) -
                Date.now(),
            ),
          );
          timer = setTimeout(refresh, delay);
        }
      }
    }
    const visible = () => {
      if (!document.hidden && Date.now() >= next) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [location]);

  useEffect(() => {
    if (!mount.current || collapsed || disabled) return;
    const engine = GrokBall.create(mount.current, {
      emotion: '02',
      color: theme === 'dark' ? '#d9d9d9' : '#292929',
      eyeColor: theme === 'dark' ? '#202020' : '#fafafa',
      label: 'mooncci 天气小球',
      lite: false,
      idle: false,
      autostart: !reduced && !document.hidden,
    });
    ball.current = engine;
    const syncEmotion = () => setDisplayedEmotion(engine.emotionId || '02');
    engine.on('change', syncEmotion);
    syncEmotion();
    const visibility = () => engine.setActive(!reduced && !document.hidden);
    const gaze = (event: PointerEvent) => {
      if (
        reduced ||
        passwordFocused.current ||
        document.hidden ||
        event.pointerType !== 'mouse' ||
        !mount.current
      )
        return;
      const rect = mount.current.getBoundingClientRect();
      const clamp = (value: number) => Math.max(-1, Math.min(1, value));
      engine.setGaze(
        clamp((event.clientX - rect.x - rect.width / 2) / (rect.width / 2)),
        clamp((event.clientY - rect.y - rect.height / 2) / (rect.height / 2)),
      );
    };
    const clear = () => engine.clearGaze();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointermove', gaze, { passive: true });
    window.addEventListener('blur', clear);
    document.documentElement.addEventListener('pointerleave', clear);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointermove', gaze);
      window.removeEventListener('blur', clear);
      document.documentElement.removeEventListener('pointerleave', clear);
      engine.off('change', syncEmotion);
      engine.destroy();
      ball.current = null;
    };
  }, [theme, reduced, collapsed, disabled]);

  useEffect(() => {
    ball.current?.setEmotion(emotion);
    if (inputMood === 'password') ball.current?.clearGaze();
  }, [emotion, theme, reduced, collapsed, disabled]);
  useEffect(
    () => () => {
      if (petTimer.current) clearTimeout(petTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
      if (helpTimer.current) clearTimeout(helpTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (root.current?.querySelector('dialog[open]')) return;
        setOpen(false);
        root.current
          ?.querySelector<HTMLButtonElement>('.weather-companion-ball')
          ?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function applyStats(value: InteractionStats) {
    if (
      !value ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isSafeInteger(value.pets) ||
      value.pets < 0 ||
      !Number.isSafeInteger(value.hits) ||
      value.hits < 0
    )
      return;
    setStats((previous) =>
      !previous || value.date > previous.date
        ? value
        : value.date < previous.date
          ? previous
          : {
              ...value,
              pets: Math.max(previous.pets, value.pets),
              hits: Math.max(previous.hits, value.hits),
            },
    );
  }
  useEffect(() => {
    if (!open || collapsed || disabled) return;
    let stopped = false;
    let pending: AbortController | null = null;
    async function refreshStats() {
      if (document.hidden || pending) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await api('/weather-mood/interactions', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!stopped) {
          applyStats(response.data);
          setStatsError('');
        }
      } catch {
        if (!stopped) setStatsError('统计暂不可用');
      } finally {
        clearTimeout(timeout);
        pending = null;
      }
    }
    void refreshStats();
    const timer = setInterval(refreshStats, 30000);
    document.addEventListener('visibilitychange', refreshStats);
    return () => {
      stopped = true;
      pending?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshStats);
    };
  }, [open, collapsed, disabled]);
  async function recordInteraction(kind: 'pet' | 'hit') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // One immutable ID per gesture. A lost response never causes a new event.
      const id = crypto.randomUUID();
      const response = await api('/weather-mood/interactions', {
        method: 'POST',
        body: JSON.stringify({ id, kind }),
        signal: controller.signal,
      });
      applyStats(response.data);
      setStatsError('');
    } catch {
      setStatsError('此次互动未确认记录，稍后刷新统计');
    } finally {
      clearTimeout(timeout);
    }
  }
  function react(kind: 'pet' | 'hit') {
    void recordInteraction(kind);
    // A pet still counts while angry, but the short angry face finishes first.
    if (kind === 'pet' && angryUntil.current > Date.now()) return;
    if (petTimer.current) clearTimeout(petTimer.current);
    setReaction(kind);
    angryUntil.current = kind === 'hit' ? Date.now() + ANGRY_DURATION_MS : 0;
    if (kind === 'pet' && !reduced) ball.current?.bounce();
    petTimer.current = setTimeout(
      () => {
        setReaction(null);
        angryUntil.current = 0;
        petTimer.current = null;
      },
      kind === 'hit' ? ANGRY_DURATION_MS : PET_DURATION_MS,
    );
  }
  function pet() {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    gesture.current.reset();
    react('pet');
  }
  function collapse(value: boolean) {
    setCollapsed(value);
    setOpen(false);
    try {
      sessionStorage.setItem('mooncci-companion-collapsed', String(value));
    } catch {}
  }
  if (disabled) return null;
  return (
    <aside
      className={`weather-companion${edgeMode ? ' weather-companion--reading-phone' : ''}${edgeMode && !edgeVisible && !open ? ' weather-companion--edge-hidden' : ''}`}
      ref={root}
      aria-label="mooncci 天气小球"
      data-emotion={displayedEmotion}
      onBlur={(event) => {
        if (edgeMode && !event.currentTarget.contains(event.relatedTarget as Node)) revealEdge();
      }}
    >
      {collapsed ? (
        <button
          className="weather-companion-wake"
          onClick={() => { collapse(false); if (edgeMode) setEdgeVisible(true); }}
          aria-label="展开天气小球"
          title="展开天气小球"
        >
          <CloudSun size={20} />
        </button>
      ) : (
        <>
          {edgeMode && !edgeVisible && !open && (
            <button
              type="button"
              className="weather-companion-edge-handle"
              aria-label="显示天气小球"
              onClick={(event) => {
                revealEdge();
                if (event.detail === 0) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.weather-companion-ball')?.focus());
              }}
            ><CloudSun size={20} aria-hidden="true" /></button>
          )}
          {open && (
            <section
              className="weather-companion-panel"
              id="weather-companion-details"
              aria-label="今日心情"
            >
              <div className="weather-companion-heading">
                <span>mooncci / 今日心情</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="关闭心情卡片"
                >
                  <X size={16} />
                </button>
              </div>
              <h2>{moodName}</h2>
              {data?.mode === 'manual' && (
                <p className="weather-companion-hint">mooncci 设定的心情</p>
              )}
              <p>
                {data?.mood?.message ||
                  (!location
                    ? '选一个城市，让天气决定今天的心情。'
                    : loaded
                      ? '天气暂不可用，先安静陪你一会儿。'
                      : `正在看看${location.name}今天的天气。`)}
              </p>
              {data?.status === 'ready' && (
                <div className="weather-companion-forecast">
                  <strong>
                    {data.city?.name} · {data.weather?.label}
                  </strong>
                  <span>
                    {data.weatherSource === 'amap' ? (
                      <>
                        日{' '}
                        {data.weather?.dayTemperature == null
                          ? '—'
                          : Math.round(data.weather.dayTemperature)}
                        ° / 夜{' '}
                        {data.weather?.nightTemperature == null
                          ? '—'
                          : Math.round(data.weather.nightTemperature)}
                        °
                      </>
                    ) : (
                      <>
                        {data.weather?.min == null
                          ? '—'
                          : Math.round(data.weather.min)}
                        ～
                        {data.weather?.max == null
                          ? '—'
                          : Math.round(data.weather.max)}{' '}
                        °C
                      </>
                    )}
                  </span>
                  <small>{data.date} · 当地当日预报</small>
                </div>
              )}
              <WeatherCityPicker
                selected={location}
                onChange={selectLocation}
                onAttributionChange={setCityAttribution}
              />
              <div
                className="weather-companion-stats"
                aria-label="今日全站互动统计"
                aria-live="polite"
              >
                <span>
                  今日被摸 <strong>{stats?.pets ?? '—'}</strong> 次
                </span>
                <span>
                  今日被打 <strong>{stats?.hits ?? '—'}</strong> 次
                </span>
                {statsError && <small>{statsError}</small>}
              </div>
              <div className="weather-companion-actions">
                <button onClick={pet}>摸摸</button>
                <button onClick={() => collapse(true)}>
                  <Minus size={14} />
                  收起小球
                </button>
                <button
                  ref={helpButton}
                  className="weather-companion-help"
                  type="button"
                  aria-label="小球互动玩法"
                  aria-describedby={
                    helpOpen ? 'weather-companion-help' : undefined
                  }
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') showHelp();
                  }}
                  onPointerLeave={hideHelpSoon}
                  onFocus={showHelp}
                  onBlur={hideHelpSoon}
                  onClick={showHelp}
                >
                  <CircleHelp size={17} />
                </button>
              </div>
              <div className="weather-companion-credits">
                {cityAttribution && (
                  <a
                    href={
                      cityAttribution === 'amap'
                        ? 'https://lbs.amap.com/'
                        : cityAttribution === 'geonames'
                          ? 'https://www.geonames.org/'
                          : 'https://www.openstreetmap.org/copyright'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    地图：
                    {cityAttribution === 'amap'
                      ? '高德地图'
                      : cityAttribution === 'geonames'
                        ? 'GeoNames'
                        : '© OpenStreetMap contributors'}
                  </a>
                )}
                {cityAttribution && data?.weatherSource && (
                  <span aria-hidden="true">·</span>
                )}
                {data?.weatherSource && (
                  <a
                    href={
                      data.weatherSource === 'amap'
                        ? 'https://lbs.amap.com/'
                        : 'https://open-meteo.com/'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    天气：
                    {data.weatherSource === 'amap' ? '高德天气' : 'Open-Meteo'}
                  </a>
                )}
              </div>
            </section>
          )}
          {helpOpen && open && (
            <div
              ref={helpPopup}
              id="weather-companion-help"
              role="tooltip"
              className="weather-companion-help-popup"
              style={helpPosition}
              onPointerEnter={() => {
                if (helpTimer.current) clearTimeout(helpTimer.current);
              }}
              onPointerLeave={hideHelpSoon}
            >
              <strong>和小球玩一会儿</strong>
              <p>划一划或点「摸摸」，它会开心。</p>
              <p>连续两次双击，会惹它短暂生气哦。</p>
            </div>
          )}
          {!open && !reaction && (focusSpeech || ambientSpeech) && (
            <span className="weather-companion-speech" aria-hidden="true">{focusSpeech || ambientSpeech}</span>
          )}
          {reaction && (
            <span className="weather-companion-pet" role="status">
              {reaction === 'hit'
                ? '哼！不许打我，生气一下！'
                : '摸摸收到，开心 +1'}
            </span>
          )}
          <button
            className="weather-companion-ball"
            tabIndex={edgeMode && !edgeVisible && !open ? -1 : 0}
            aria-hidden={edgeMode && !edgeVisible && !open ? true : undefined}
            aria-label={`查看今日心情：${moodName}`}
            aria-expanded={open}
            aria-controls="weather-companion-details"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ')
                pointerClick.current = -Infinity;
            }}
            onClick={(event) => {
              // Pointer releases are handled below. Leave native keyboard/AT activation intact.
              if (
                performance.now() - pointerClick.current < 800 ||
                event.detail > 0
              ) {
                pointerClick.current = -Infinity;
                return;
              }
              if (clickTimer.current) clearTimeout(clickTimer.current);
              gesture.current.reset();
              setOpen((value) => !value);
            }}
            onDoubleClick={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              if (clickTimer.current) clearTimeout(clickTimer.current);
              pointerClick.current = performance.now();
              if (
                pointer.current.begin(
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                  performance.now(),
                )
              )
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (
                pointer.current.move(
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                )
              )
                pet();
            }}
            onPointerUp={(event) => {
              pointerClick.current = performance.now();
              if (!pointer.current.end(event.pointerId, performance.now()))
                return;
              const action = gesture.current.tap(performance.now());
              if (action === 'hit') react('hit');
              else if (action === 'single')
                clickTimer.current = setTimeout(
                  () => setOpen((value) => !value),
                  DOUBLE_TAP_MS + 10,
                );
            }}
            onPointerCancel={(event) => {
              pointer.current.cancel(event.pointerId);
              gesture.current.reset();
              if (clickTimer.current) clearTimeout(clickTimer.current);
            }}
            onLostPointerCapture={(event) =>
              pointer.current.cancel(event.pointerId)
            }
          >
            <span
              className="weather-companion-mount"
              ref={mount}
              aria-hidden="true"
            />
            <span className="weather-companion-label">
              {GrokBall.EMOTIONS.find(item => item.id === displayedEmotion)?.name || moodName}
            </span>
          </button>
        </>
      )}
    </aside>
  );
}
