import { readFileSync } from 'node:fs';

const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const expiresAt = '2026-11-26T00:00:00+08:00';
const [reportPath, auditStatus] = process.argv.slice(2);
const rawReport = readFileSync(reportPath, 'utf8');
const report = JSON.parse(rawReport);

if (report.auditReportVersion !== 2 || report.error
    || !report.vulnerabilities || typeof report.vulnerabilities !== 'object'
    || Array.isArray(report.vulnerabilities)) {
  console.error(rawReport);
  throw new Error('Expected a complete npm audit report.');
}

const findings = report.vulnerabilities;
if (auditStatus === '0') {
  console.log('Frontend audit passed at the moderate threshold.');
} else {
  const { packages } = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const blocking = Object.keys(findings).filter(name => !['info', 'low'].includes(findings[name]?.severity));

  // npm also reports each package that inherits an advisory from a dependency.
  function isWaived(name, path = []) {
    if (!Object.hasOwn(findings, name) || path.includes(name)) return false;
    const { nodes, via } = findings[name];
    return Array.isArray(nodes) && nodes.length > 0 && nodes.every(node => packages[node]?.dev === true)
      && Array.isArray(via) && via.length > 0
      && via.every(cause => typeof cause === 'string'
        ? isWaived(cause, [...path, name])
        : name === 'picomatch' && cause?.dependency === 'picomatch' && cause.url === advisory);
  }

  if (auditStatus === '1' && Date.now() < Date.parse(expiresAt)
      && blocking.length > 0 && blocking.every(name => isWaived(name))) {
    console.warn(`::warning::Frontend development dependency audit exception until ${expiresAt}. ${advisory}`);
  } else {
    console.error(rawReport);
    process.exitCode = 1;
  }
}
