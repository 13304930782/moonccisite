"""Collect local QA evidence without changing production or source files."""
import json, shutil, hashlib, tarfile, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/experience-review'
OUT.mkdir(exist_ok=True)

def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))

baseline = read('.cache/experience-baseline/report.json')
after = read('.cache/experience-final/report.json')
roles = read('.cache/experience-release-roles/report.json')
guards = dict(re.findall(r'<Route path="([^"]+)" element=\{<Guard([^>]*)>', (ROOT / 'src/app/App.tsx').read_text(encoding='utf-8')))
for row in roles['results']:
    if row['route'] not in guards:
        continue
    flags = guards[row['route']]
    role = row['role']
    denied = ('ownerOnly' in flags and role != 'owner') or ('adminOnly' in flags and role not in ['admin', 'owner']) or ('writerOnly' in flags and role not in ['editor', 'admin', 'owner'])
    if role == 'guest':
        assert '/login?' in row['finalUrl'], row
    elif denied:
        assert row.get('heading') == '当前账号无法访问此页面', row
print('Role guard expectations verified against the route access declarations.')
for label, report in [('baseline', baseline), ('after', after), ('roles', roles)]:
    (OUT / f'{label}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
for file in (ROOT / '.cache/experience-qa').glob('result-*.json'):
    shutil.copy2(file, OUT / file.name)

lines = ['# 全路由检查与截图', '', '2026-09-27。基线与修改后各 62 × 3 = 186 个视图；最终发布构建的五种身份各检查 62 条路由，共 310 个桌面视图。', '',
         '检查项：横向溢出、页面脚本异常、原生下拉残留、标题、主题和接口异常。身份矩阵另记录最终 URL，以区分实际页面与权限跳转。缺少测试数据的详情可显示空态或不存在。', '',
         '手机 390px、桌面 1440px、深色桌面为路由批量检查；320/768px 在关键控件与阅读流程中补验。', '',
         '## 逐路由清单', '', '| 路由 | 桌面 | 手机 | 深色 |', '| --- | --- | --- | --- |']
for route in dict.fromkeys(r['route'] for r in after['results']):
    cells = []
    for mode in ['desktop', 'mobile', 'dark']:
        row = next(r for r in after['results'] if r['route'] == route and r['mode'] == mode)
        state = '通过' if not (row['overflow'] or row['errors'] or row['selects']) else '需检查'
        cells.append(f"[{state}](../../.cache/experience-final/{row['file']})")
    lines.append('| ' + route + ' | ' + ' | '.join(cells) + ' |')
lines += ['', '## 五种身份访问结果', '', '| 路由 | 游客 | 用户 | 编辑 | 管理员 | 站长 |', '| --- | --- | --- | --- | --- | --- |']
for route in dict.fromkeys(r['route'] for r in roles['results']):
    cells = []
    for role in ['guest', 'user', 'editor', 'admin', 'owner']:
        row = next(r for r in roles['results'] if r['route'] == route and r['role'] == role)
        label = (row.get('heading') or '页面已渲染').replace('|', '/')
        cells.append(f"[{label}](../../.cache/experience-release-roles/{row['file']})")
    lines.append('| ' + route + ' | ' + ' | '.join(cells) + ' |')
lines += ['', '## 代表页面前后对照', '']
for route in ['/', '/updates', '/account', '/account/settings', '/admin/reviews']:
    matched = [r for r in after['results'] if r['route'] == route]
    if not matched:
        continue
    lines += ['### ' + route, '']
    for row in matched:
        old = next((r for r in baseline['results'] if r['route'] == route and r['mode'] == row['mode']), None)
        if old:
            for label, folder, item in [('before', 'experience-baseline', old), ('after', 'experience-final', row)]:
                filename = label + '-' + item['file']
                shutil.copy2(ROOT / '.cache' / folder / item['file'], OUT / filename)
            lines += [f"{row['mode']}：[修改前](before-{old['file']}) · [修改后](after-{row['file']})", '']
archive = ROOT / 'outputs/mooncci-experience.tar.gz'
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
with tarfile.open(archive) as package:
    members = set(package.getnames())
    sums = package.extractfile('SHA256SUMS').read().decode()
    for line in sums.splitlines():
        expected, name = line.split('  ', 1)
        assert hashlib.sha256(package.extractfile(name).read()).hexdigest() == expected
    assert not any(name.startswith('server/') for name in members)
    manifest = json.loads(package.extractfile('MANIFEST.json').read())
    assert manifest['migrations'] is False and not manifest['restarts']
    for name in members:
        if not name.startswith('dist/'):
            assert b'\r' not in package.extractfile(name).read(), name
assert (ROOT / 'outputs/mooncci-experience.tar.gz.sha256').read_text().split()[0] == digest
lines += ['## 包校验', '', f'最终部署包 SHA-256：`{digest}`', '', '包内逐文件校验通过；元数据及脚本 LF 检查通过；无后端文件、迁移或服务重启。', '',
          '尚未执行生产部署；实际 iPhone Safari、VoiceOver 及浏览器原生 200% 缩放待人工补验。']
(OUT / 'index.md').write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(f'Evidence written: {OUT}; package verified: {digest}')
