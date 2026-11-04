export type TimelineLabel = { anchor: number; width: number };

/** Pack measured labels without moving their date markers. */
export function layoutTimelineLabels(labels: TimelineLabel[], width: number, gap = 16) {
  const ends: number[] = [];
  const positions = labels.map((label, index) => ({
    index,
    width: Math.min(label.width, width),
    left: Math.max(0, Math.min(label.anchor - label.width / 2, width - label.width)),
  })).sort((a, b) => a.left - b.left || a.index - b.index);
  return positions.map(label => {
    let lane = ends.findIndex(end => end + gap <= label.left);
    if (lane < 0) lane = ends.length;
    ends[lane] = label.left + label.width;
    return { ...label, lane };
  }).sort((a, b) => a.index - b.index);
}
