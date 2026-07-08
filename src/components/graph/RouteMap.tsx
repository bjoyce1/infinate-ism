// Mini schematic map for a walkable route. Parses cardinal directions and
// left/right turns out of a directions string and renders them as an SVG
// polyline with street-name labels, a green start pin, and an amber end pin.
//
// This is a schematic — not a real geo map — but it makes the shape of each
// walk from Screwed Up Records & Tapes to an HQ landmark instantly readable.

type Segment = {
  dx: number;
  dy: number;
  length: number;
  street?: string;
};

type Leg = {
  label?: string;
  color: string;
  segments: Segment[];
  distance?: string;
  duration?: string;
};

const DIR_VECTORS: Record<string, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
  northeast: { dx: 0.707, dy: -0.707 },
  northwest: { dx: -0.707, dy: -0.707 },
  southeast: { dx: 0.707, dy: 0.707 },
  southwest: { dx: -0.707, dy: 0.707 },
};

function rotate({ dx, dy }: { dx: number; dy: number }, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { dx: dx * c - dy * s, dy: dx * s + dy * c };
}

// Turn a directions phrase like "North on Cullen Blvd" or
// "right on Reed Rd" into a Segment. Heading is carried between phrases so
// relative turns work.
function parseDirections(text: string): { segments: Segment[]; final: { dx: number; dy: number } } {
  const phrases = text.split(/[,;]|\bthen\b/i).map((p) => p.trim()).filter(Boolean);
  let heading = { dx: 0, dy: -1 }; // default north
  const segments: Segment[] = [];
  for (const raw of phrases) {
    const p = raw.toLowerCase();
    // Detect absolute cardinal direction as first non-noise word.
    let matched = false;
    for (const key of Object.keys(DIR_VECTORS)) {
      if (new RegExp(`\\b${key}\\b`).test(p)) {
        heading = { ...DIR_VECTORS[key] };
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (/\bright\b/.test(p)) heading = rotate(heading, 90);
      else if (/\bleft\b/.test(p)) heading = rotate(heading, -90);
      else if (/\b(continue|straight|onward|proceed)\b/.test(p)) {
        // keep heading
      } else {
        // No directional cue — skip so we don't add a bogus segment.
        continue;
      }
    }
    // Street name: "on <Name>" or "onto <Name>" up to the next preposition.
    const streetMatch = raw.match(/\b(?:on|onto|along|via|down|up)\s+([A-Z][A-Za-z0-9.\- ]*?)(?=\s+(?:to|toward|towards|through|past|until|and|then|,|$))/);
    const alt = raw.match(/\b(?:on|onto|along|via)\s+([A-Z][A-Za-z0-9.\- ]{1,40})/);
    const street = (streetMatch?.[1] || alt?.[1] || "").trim() || undefined;
    segments.push({ dx: heading.dx, dy: heading.dy, length: 1, street });
  }
  return { segments, final: heading };
}

function buildLegs(
  directions: string | undefined,
  distance: string | undefined,
  duration: string | undefined,
  days: Array<{ label?: string; distance?: string; duration?: string; directions?: string }> | undefined,
): Leg[] {
  const palette = ["#ffcc4d", "#7df9ff", "#a78bfa", "#3DED97", "#fb7185"];
  if (days && days.length > 0) {
    return days
      .map((d, i) => {
        if (!d.directions) return null;
        const { segments } = parseDirections(d.directions);
        if (segments.length === 0) return null;
        return {
          label: d.label ?? `Day ${i + 1}`,
          color: palette[i % palette.length],
          segments,
          distance: d.distance,
          duration: d.duration,
        } as Leg;
      })
      .filter((l): l is Leg => Boolean(l));
  }
  if (!directions) return [];
  const { segments } = parseDirections(directions);
  if (segments.length === 0) return [];
  return [{ color: "#ffcc4d", segments, distance, duration }];
}

export function RouteMap({
  from,
  to,
  directions,
  distance,
  duration,
  days,
  height = 160,
}: {
  from: string;
  to: string;
  directions?: string;
  distance?: string;
  duration?: string;
  days?: Array<{ label?: string; distance?: string; duration?: string; directions?: string }>;
  height?: number;
}) {
  const legs = buildLegs(directions, distance, duration, days);
  if (legs.length === 0) return null;

  // Walk each leg end-to-end, accumulating world-space vertices.  Each leg
  // resumes from where the previous ended.
  type Vertex = { x: number; y: number; legIndex: number; street?: string };
  const vertices: Vertex[] = [];
  let cx = 0;
  let cy = 0;
  vertices.push({ x: cx, y: cy, legIndex: 0 });
  legs.forEach((leg, li) => {
    for (const seg of leg.segments) {
      cx += seg.dx * seg.length;
      cy += seg.dy * seg.length;
      vertices.push({ x: cx, y: cy, legIndex: li, street: seg.street });
    }
  });

  // Fit vertices into viewBox.
  const pad = 22;
  const vbW = 320;
  const vbH = height;
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((vbW - pad * 2) / spanX, (vbH - pad * 2) / spanY);
  const ox = (vbW - spanX * scale) / 2 - minX * scale;
  const oy = (vbH - spanY * scale) / 2 - minY * scale;
  const toScreen = (v: { x: number; y: number }) => ({
    x: v.x * scale + ox,
    y: v.y * scale + oy,
  });

  // Build per-leg polylines.
  const legPaths = legs.map((_, li) => {
    const points = vertices.filter((_v, i) => {
      // include the vertex ending each segment in this leg, plus its start.
      if (i === 0) return li === 0;
      const seg = vertices[i];
      const prev = vertices[i - 1];
      return seg.legIndex === li || prev.legIndex === li;
    });
    // De-dupe consecutive references.
    const seen = new Set<number>();
    const uniq = points.filter((p) => {
      const idx = vertices.indexOf(p);
      if (seen.has(idx)) return false;
      seen.add(idx);
      return true;
    });
    return uniq.map(toScreen);
  });

  const start = toScreen(vertices[0]);
  const end = toScreen(vertices[vertices.length - 1]);

  // Street labels: place at midpoint of each segment, deduped.
  const labels: Array<{ x: number; y: number; text: string; color: string }> = [];
  const seenStreet = new Set<string>();
  for (let i = 1; i < vertices.length; i++) {
    const v = vertices[i];
    const prev = vertices[i - 1];
    if (!v.street) continue;
    if (seenStreet.has(v.street)) continue;
    seenStreet.add(v.street);
    const a = toScreen(prev);
    const b = toScreen(v);
    labels.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2 - 4,
      text: v.street,
      color: legs[v.legIndex].color,
    });
  }

  return (
    <div className="rounded-md overflow-hidden border border-white/10 bg-black/50">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Walking route map from ${from} to ${to}`}
        style={{ display: "block" }}
      >
        <defs>
          <pattern id="rm-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="rgba(120,170,220,0.08)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={vbW} height={vbH} fill="#0a1428" />
        <rect width={vbW} height={vbH} fill="url(#rm-grid)" />

        {/* Route polyline per leg — glow + core. */}
        {legPaths.map((pts, li) => {
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
          const color = legs[li].color;
          return (
            <g key={li}>
              <path d={d} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 5"
              />
            </g>
          );
        })}

        {/* Turn dots at each interior vertex. */}
        {vertices.slice(1, -1).map((v, i) => {
          const s = toScreen(v);
          return <circle key={i} cx={s.x} cy={s.y} r={2.5} fill="#e6ecf5" opacity="0.7" />;
        })}

        {/* Street labels. */}
        {labels.map((l, i) => (
          <g key={`lbl-${i}`}>
            <text
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontFamily="'Space Grotesk','Sora',sans-serif"
              fontSize="9"
              fontWeight="600"
              fill="#0a1428"
              stroke="#0a1428"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {l.text}
            </text>
            <text
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontFamily="'Space Grotesk','Sora',sans-serif"
              fontSize="9"
              fontWeight="600"
              fill={l.color}
            >
              {l.text}
            </text>
          </g>
        ))}

        {/* Start pin (shop). */}
        <g>
          <circle cx={start.x} cy={start.y} r={9} fill="#3DED97" fillOpacity="0.2" />
          <circle cx={start.x} cy={start.y} r={5} fill="#3DED97" stroke="#0b0d10" strokeWidth="1.5" />
          <text
            x={start.x}
            y={start.y - 10}
            textAnchor="middle"
            fontFamily="'Space Grotesk',sans-serif"
            fontSize="8"
            fontWeight="700"
            fill="#3DED97"
            stroke="#0a1428"
            strokeWidth="3"
            paintOrder="stroke"
          >
            SHOP
          </text>
        </g>

        {/* End pin (landmark). */}
        <g>
          <circle cx={end.x} cy={end.y} r={9} fill="#ffcc4d" fillOpacity="0.25" />
          <circle cx={end.x} cy={end.y} r={5} fill="#ffcc4d" stroke="#0b0d10" strokeWidth="1.5" />
          <text
            x={end.x}
            y={end.y - 10}
            textAnchor="middle"
            fontFamily="'Space Grotesk',sans-serif"
            fontSize="8"
            fontWeight="700"
            fill="#ffcc4d"
            stroke="#0a1428"
            strokeWidth="3"
            paintOrder="stroke"
          >
            {to.length > 22 ? to.slice(0, 20) + "…" : to}
          </text>
        </g>

        {/* Compass rose. */}
        <g transform={`translate(${vbW - 22} 22)`} opacity="0.6">
          <circle r="10" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.2)" />
          <path d="M0 -8 L2.5 0 L0 8 L-2.5 0 Z" fill="#e6ecf5" />
          <text y="-11" textAnchor="middle" fontSize="7" fontWeight="700" fill="#e6ecf5" fontFamily="sans-serif">N</text>
        </g>
      </svg>
      {legs.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 py-1.5 bg-black/60 border-t border-white/10">
          {legs.map((leg, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-white/70">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: leg.color }} />
              {leg.label ?? `Leg ${i + 1}`}
              {leg.distance && <span className="text-white/40 normal-case">· {leg.distance}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}