// Keep rename processing linear even for a maximum-size JSON request.
function sanitizeNamePart(value) {
  let name = String(value || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot >= 0 && dot < name.length - 1) name = name.slice(0, dot);
  name = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  let start = 0, end = name.length;
  while (start < end && '-_.'.includes(name[start])) start++;
  while (end > start && '-_.'.includes(name[end - 1])) end--;
  return name.slice(start, end).slice(0, 120) || `image-${Date.now()}`;
}

module.exports = { sanitizeNamePart };
