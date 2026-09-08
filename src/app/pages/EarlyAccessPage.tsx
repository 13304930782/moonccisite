import { ThemeSelect } from '../components/ThemeSelect';
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
import { SitePage, PageHeading } from '../components/ContentUI';
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

const fieldClass =
  'neo-input mt-2 w-full px-4 py-3 outline-none placeholder:text-muted-foreground disabled:opacity-60';

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
        : [...form.desiredFeatures, feature],
    );
  };

  const focusForm = () => {
    formRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
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
    <SitePage>
      <PageHeading eyebrow="PromptDock / Early Access" title="一起打磨 PromptDock">
        <p>
          一款从 macOS 开始的 Prompt
          管理与工作流工具。邀请你提前体验，也欢迎分享实际使用中的问题与想法。
        </p>
      </PageHeading>
      <div className="detail-columns">
        <aside className="detail-aside">
          <h2>关于这次内测</h2>
          <p>当前开放 macOS 版本。Windows、iPhone 和 iPad 仍在计划中。</p>
          <dl className="plain-facts">
            <div>
              <dt>提前体验</dt>
              <dd>试用正在构建的功能。</dd>
            </div>
            <div>
              <dt>参与反馈</dt>
              <dd>让真实工作流影响后续开发。</dd>
            </div>
            <div>
              <dt>后续安排</dt>
              <dd>审核结果与体验说明通过邮件发送。</dd>
            </div>
          </dl>
          <button type="button" className="text-link" onClick={focusForm}>
            填写申请 ↓
          </button>
        </aside>
        <section id="early-access-form" className="detail-body">
          <div className="form-section-heading">
            <h2>申请体验</h2>
            <p>这些信息仅用于内测筛选与联系。</p>
          </div>
          {success ? (
            <div role="status" className="quiet-state">
              <h3>申请已提交</h3>
              <p>我们会通过邮件联系你。</p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={submit} className="site-form scroll-mt-24">
              <div className="grid gap-6 md:grid-cols-2">
                <label className="font-medium">
                  姓名
                  <input
                    ref={nameRef}
                    required
                    maxLength={80}
                    value={form.name}
                    onChange={(event) => update('name', event.target.value)}
                    className={fieldClass}
                    autoComplete="name"
                  />
                </label>
                <label className="font-medium">
                  邮箱
                  <input
                    required
                    maxLength={254}
                    type="email"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    className={fieldClass}
                    autoComplete="email"
                    inputMode="email"
                  />
                </label>
                <label className="font-medium">
                  职业身份
                  <ThemeSelect
                    required
                    value={form.occupation}
                    onValueChange={(nextValue) => update('occupation', nextValue)}
                    className={fieldClass}
                  >
                    <option value="">请选择</option>
                    {occupations.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </ThemeSelect>
                </label>
                <label className="font-medium">
                  当前设备
                  <ThemeSelect
                    required
                    value={form.device}
                    onValueChange={(nextValue) => update('device', nextValue)}
                    className={fieldClass}
                  >
                    <option value="">请选择</option>
                    {devices.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </ThemeSelect>
                </label>
                <label className="font-medium md:col-span-2">
                  macOS 版本
                  <input
                    required
                    maxLength={100}
                    value={form.macOSVersion}
                    onChange={(event) => update('macOSVersion', event.target.value)}
                    className={fieldClass}
                    placeholder="例如：macOS 15.5"
                  />
                </label>
                <label className="font-medium md:col-span-2">
                  主要使用场景
                  <textarea
                    required
                    maxLength={3000}
                    rows={4}
                    value={form.useCase}
                    onChange={(event) => update('useCase', event.target.value)}
                    className={fieldClass}
                    placeholder="例如：AI 辅助工作、教学备课、代码开发、内容创作"
                  />
                </label>
              </div>

              <fieldset className="mt-8">
                <legend className="font-medium">希望体验的功能</legend>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  {features.map(([value, label]) => {
                    const checked = form.desiredFeatures.includes(value);
                    return (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-3 py-2 text-sm ${checked ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFeature(value)}
                          className="h-4 w-4 accent-current"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="mt-8 block font-medium">
                申请理由
                <textarea
                  required
                  maxLength={3000}
                  rows={4}
                  value={form.reason}
                  onChange={(event) => update('reason', event.target.value)}
                  className={fieldClass}
                  placeholder="你为什么想加入 Early Access？希望 PromptDock 帮你解决什么问题？"
                />
              </label>

              {message && (
                <div
                  role="alert"
                  className="mt-6 border border-border bg-muted px-4 py-3 font-medium shadow-none"
                >
                  {message}
                </div>
              )}

              <div className="mt-8 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
                <p className="max-w-xl text-xs font-medium leading-6 text-muted-foreground">
                  提交即表示你同意我们仅为 Early Access 审核与后续联系处理这些信息。
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="neo-button neo-button-dark shrink-0 px-7 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {submitting ? '提交中…' : '提交申请'} <Code2 className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </SitePage>
  );
}
