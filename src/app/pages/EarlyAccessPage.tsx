import { FormEvent, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDown,
  Check,
  CheckCircle2,
  Code2,
  Laptop,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { api } from '../lib/api';

type FormState = {
  name: string;
  email: string;
  occupation: string;
  useCase: string;
  device: string;
  macOSVersion: string;
  desiredFeatures: string[];
  reason: string;
};

const initialForm: FormState = {
  name: '',
  email: '',
  occupation: '',
  useCase: '',
  device: '',
  macOSVersion: '',
  desiredFeatures: [],
  reason: '',
};

const occupations = [
  ['student', '学生'],
  ['teacher', '教师'],
  ['developer', '开发者'],
  ['creator', '创作者'],
  ['enterprise', '企业用户'],
  ['other', '其他'],
];

const devices = [
  ['macbook', 'MacBook'],
  ['imac', 'iMac'],
  ['mac_mini', 'Mac mini'],
  ['mac_studio', 'Mac Studio'],
];

const features = [
  ['prompt_management', 'Prompt 管理'],
  ['ai_workflow', 'AI 工作流'],
  ['desktop_widget', '桌面 Widget'],
  ['menu_bar', '菜单栏工具'],
  ['ai_assistant', 'AI 助手'],
];

const fieldClass = 'neo-input mt-2 w-full px-4 py-3 outline-none placeholder:text-black/35 disabled:opacity-60';

export default function EarlyAccessPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const update = (key: keyof FormState, value: string | string[]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const toggleFeature = (feature: string) => {
    update(
      'desiredFeatures',
      form.desiredFeatures.includes(feature)
        ? form.desiredFeatures.filter((item) => item !== feature)
        : [...form.desiredFeatures, feature]
    );
  };

  const focusForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => nameRef.current?.focus(), 500);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    if (form.desiredFeatures.length === 0) {
      setMessage('请至少选择一项希望体验的功能。');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api('/early-access', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setMessage(response.message || '感谢加入 Early Access 计划！我们会通过邮件联系你。');
      setForm(initialForm);
      setSuccess(true);
    } catch (error: any) {
      setMessage(error.message || '申请提交失败，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="neo-page">
      <Header />

      <main>
        <section className="neo-dot-grid border-b-2 border-black px-5 pb-20 pt-36 lg:px-6 lg:pb-24 lg:pt-44">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-7xl"
          >
            <span className="neo-kicker bg-white">PromptDock / Early Access Program</span>
            <div className="mt-9 grid items-end gap-10 lg:grid-cols-[1.45fr_0.55fr]">
              <div>
                <h1 className="neo-heading max-w-5xl text-5xl leading-[1.02] md:text-7xl lg:text-[5.7rem]">
                  加入 PromptDock<br />Early Access 计划
                </h1>
                <p className="mt-8 max-w-3xl text-lg font-bold leading-8 text-black/70 md:text-xl">
                  抢先体验下一代 AI Prompt 管理与工作流工具。参与产品共创，帮助我们打造更适合真实用户需求的 AI 生产力应用。
                </p>
                <button type="button" onClick={focusForm} className="neo-button neo-button-dark mt-10 px-7 py-4">
                  申请体验 <ArrowDown className="h-5 w-5" />
                </button>
              </div>

              <div className="neo-card-lg rounded-[12px] bg-white p-7">
                <div className="flex items-center justify-between">
                  <Laptop className="h-10 w-10" />
                  <span className="border-2 border-black bg-[#b7c6c2] px-3 py-1 font-mono text-xs font-black">macOS ✓</span>
                </div>
                <h2 className="neo-heading mt-10 text-3xl">Native first.</h2>
                <p className="mt-4 text-sm font-bold leading-7 text-black/60">
                  当前版本专为 macOS 原生体验设计。其他平台仍在计划中，不会展示尚未存在的能力。
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-6 lg:py-24">
          <span className="neo-kicker bg-[#b7c6c2]">01 / Why join</span>
          <h2 className="neo-heading mt-7 text-5xl md:text-6xl">为什么加入 Early Access？</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Sparkles, title: '提前体验', text: '第一时间使用 macOS 原生 AI 工具。' },
              { icon: MessageSquareText, title: '参与共创', text: '反馈使用体验，影响产品未来方向。' },
              { icon: ShieldCheck, title: '专属权益', text: '未来优先体验 PromptDock 新功能。' },
            ].map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="neo-card rounded-[12px] p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-14 w-14 items-center justify-center border-2 border-black bg-[#ffe17c]">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="font-mono text-sm font-black">0{index + 1}</span>
                </div>
                <h3 className="neo-heading mt-10 text-3xl">{title}</h3>
                <p className="mt-4 text-sm font-bold leading-7 text-black/60">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y-2 border-black bg-[#171e19] px-5 py-20 text-white lg:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <span className="neo-kicker border-white bg-[#171e19] text-white shadow-[3px_3px_0_#b7c6c2]">02 / Platforms</span>
            <h2 className="neo-heading mt-7 text-5xl md:text-6xl">从 macOS 开始。</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-4">
              <article className="border-2 border-white bg-[#ffe17c] p-6 text-black shadow-[6px_6px_0_#fff] md:col-span-2">
                <div className="flex items-center justify-between">
                  <Laptop className="h-8 w-8" />
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="neo-heading mt-12 text-4xl">macOS</h3>
                <p className="mt-4 text-sm font-bold leading-7">当前版本专为 macOS 原生体验设计。</p>
              </article>
              {['Windows', 'iPhone', 'iPad'].map((platform) => (
                <article key={platform} className="border-2 border-white/45 bg-[#171e19] p-6">
                  <span className="font-mono text-xs font-black uppercase tracking-widest text-[#b7c6c2]">Coming Soon</span>
                  <h3 className="neo-heading mt-16 text-3xl text-white">{platform}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="early-access-form" className="neo-dot-grid px-5 py-20 lg:px-6 lg:py-24">
          <div className="mx-auto max-w-5xl">
            <span className="neo-kicker bg-white">03 / Apply</span>
            <h2 className="neo-heading mt-7 text-5xl md:text-6xl">告诉我们你的真实工作流。</h2>
            <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-black/65">
              申请信息仅用于 Early Access 筛选与联系。提交后，我们会通过邮件通知后续安排。
            </p>

            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                role="status"
                className="neo-card-lg mt-12 rounded-[12px] bg-white p-8 md:p-12"
              >
                <span className="flex h-16 w-16 items-center justify-center border-2 border-black bg-[#ffe17c] shadow-[4px_4px_0_#000]">
                  <Check className="h-8 w-8" />
                </span>
                <h3 className="neo-heading mt-9 text-4xl">感谢加入 Early Access 计划！</h3>
                <p className="mt-5 text-lg font-bold text-black/65">我们会通过邮件联系你。</p>
              </motion.div>
            ) : (
              <form ref={formRef} onSubmit={submit} className="neo-card-lg mt-12 scroll-mt-32 rounded-[12px] bg-white p-6 md:p-10">
                <div className="grid gap-6 md:grid-cols-2">
                  <label className="font-black">
                    姓名
                    <input ref={nameRef} required maxLength={80} value={form.name} onChange={(event) => update('name', event.target.value)} className={fieldClass} autoComplete="name" />
                  </label>
                  <label className="font-black">
                    邮箱
                    <input required maxLength={254} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className={fieldClass} autoComplete="email" inputMode="email" />
                  </label>
                  <label className="font-black">
                    职业身份
                    <select required value={form.occupation} onChange={(event) => update('occupation', event.target.value)} className={fieldClass}>
                      <option value="">请选择</option>
                      {occupations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="font-black">
                    当前设备
                    <select required value={form.device} onChange={(event) => update('device', event.target.value)} className={fieldClass}>
                      <option value="">请选择</option>
                      {devices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="font-black md:col-span-2">
                    macOS 版本
                    <input required maxLength={100} value={form.macOSVersion} onChange={(event) => update('macOSVersion', event.target.value)} className={fieldClass} placeholder="例如：macOS 15.5" />
                  </label>
                  <label className="font-black md:col-span-2">
                    主要使用场景
                    <textarea required maxLength={3000} rows={5} value={form.useCase} onChange={(event) => update('useCase', event.target.value)} className={fieldClass} placeholder="例如：AI 辅助工作、教学备课、代码开发、内容创作" />
                  </label>
                </div>

                <fieldset className="mt-8">
                  <legend className="font-black">希望体验的功能</legend>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {features.map(([value, label]) => {
                      const checked = form.desiredFeatures.includes(value);
                      return (
                        <label key={value} className={`flex cursor-pointer items-center gap-3 border-2 border-black px-4 py-3 font-bold transition ${checked ? 'bg-[#ffe17c] shadow-[3px_3px_0_#000]' : 'bg-white hover:bg-[#b7c6c2]'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleFeature(value)} className="h-4 w-4 accent-black" />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="mt-8 block font-black">
                  申请理由
                  <textarea required maxLength={3000} rows={5} value={form.reason} onChange={(event) => update('reason', event.target.value)} className={fieldClass} placeholder="你为什么想加入 Early Access？希望 PromptDock 帮你解决什么问题？" />
                </label>

                {message && (
                  <div role="alert" className="mt-6 border-2 border-black bg-[#ffe17c] px-4 py-3 font-bold shadow-[3px_3px_0_#000]">
                    {message}
                  </div>
                )}

                <div className="mt-8 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
                  <p className="max-w-xl text-xs font-bold leading-6 text-black/55">
                    提交即表示你同意我们仅为 Early Access 审核与后续联系处理这些信息。
                  </p>
                  <button type="submit" disabled={submitting} className="neo-button neo-button-dark shrink-0 px-7 disabled:cursor-not-allowed disabled:opacity-55">
                    {submitting ? '提交中…' : '提交申请'} <Code2 className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
