import { matchesLanguage } from "./playback-preferences";

/**
 * Recaps: a slideshow (image, title, text per slide) that catches the viewer up on the film so far. A stream publishes
 * `{streamId}/recaps/index.json` on the stream CDN, listing one WebVTT file per language. The VTT is read here and
 * never added to the <video> as a text track, or the player would show it as subtitles.
 *
 * A cue's times are the slideshow's own clock. Its first line is the image path relative to the VTT, optionally with
 * `#t=<seconds>`: the film moment the slide is about. The second line is the slide title, the rest its text.
 */

/** One entry of `recaps/index.json`. `url` is relative to `recaps/`. */
export type RecapIndexEntry = {
  language: string;
  title?: string;
  url: string;
  slides?: number;
  duration?: number;
};

export type RecapIndex = {
  version: 1;
  recaps: RecapIndexEntry[];
};

export type RecapSlide = {
  /** Seconds on the slideshow clock. */
  start: number;
  end: number;
  /** Image path as written in the VTT, without `#t`. */
  image: string;
  /**
   * The film moment the slide is about, in seconds. A slide without `#t` takes the previous slide's (the first one 0),
   * so it shows together with the slide before it.
   */
  at: number;
  title: string;
  body: string;
};

export type RecapDocument = {
  /** From the VTT's NOTE header (`language:`), if any. */
  language: string | null;
  /** From the VTT's NOTE header (`title:`), if any. */
  title: string | null;
  slides: RecapSlide[];
};

/** A recap ready to show: slides with absolute image URLs. */
export type Recap = {
  language: string | null;
  title: string | null;
  url: string;
  slides: (RecapSlide & { imageUrl: string })[];
};

/** Where a stream's recaps are listed. */
export function recapIndexUrl(cdnOrigin: string, streamId: string): string {
  return `${cdnOrigin}/${encodeURIComponent(streamId)}/recaps/index.json`;
}

/** "01:02:03.500", "02:03.500" or "02:03" → seconds; NaN when it isn't a timestamp. */
export function parseTimestamp(value: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!m) return NaN;
  const [, h, min, s, ms] = m;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + (ms ? Number(ms.padEnd(3, "0")) / 1000 : 0);
}

/** The image path and its `#t` film time (null without one). `#t=754` and `#t=754,760` both give 754. */
export function splitImageRef(ref: string): { image: string; at: number | null } {
  const hash = ref.indexOf("#");
  if (hash < 0) return { image: ref, at: null };
  const image = ref.slice(0, hash);
  const t = /(?:^|&)t=(?:npt:)?([^,&]+)/.exec(ref.slice(hash + 1));
  if (!t) return { image, at: null };
  const raw = t[1];
  const at = raw.includes(":") ? parseTimestamp(raw) : Number(raw);
  return { image, at: Number.isFinite(at) && at >= 0 ? at : null };
}

/**
 * Reads a recap VTT. Lenient about what WebVTT allows (BOM, CRLF, cue ids or none, cue settings, `mm:ss.mmm`);
 * cues without an image line are skipped. Returns no slides for anything that isn't WebVTT.
 */
export function parseRecapVtt(text: string): RecapDocument {
  const doc: RecapDocument = { language: null, title: null, slides: [] };
  const blocks = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) => block.replace(/^\n+/, ""));
  if (!/^WEBVTT(?:[ \t\n]|$)/.test(blocks[0] ?? "")) return doc;

  let lastAt = 0;
  for (const block of blocks.slice(1)) {
    const lines = block.split("\n");
    if (lines.length === 0 || !lines[0].trim()) continue;

    if (/^NOTE(?:[ \t]|$)/.test(lines[0])) {
      // The header: `key: value` lines, on the NOTE line itself or below it.
      for (const line of [lines[0].replace(/^NOTE[ \t]*/, ""), ...lines.slice(1)]) {
        const kv = /^([a-z_-]+)\s*:\s*(.*)$/i.exec(line.trim());
        if (!kv) continue;
        const key = kv[1].toLowerCase();
        if (key === "language" && kv[2]) doc.language ??= kv[2].trim();
        if (key === "title" && kv[2]) doc.title ??= kv[2].trim();
      }
      continue;
    }
    if (/^(?:STYLE|REGION)(?:[ \t]|$)/.test(lines[0])) continue;

    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0 || timing > 1) continue;
    const [from, rest] = lines[timing].split("-->");
    const start = parseTimestamp(from);
    const end = parseTimestamp(rest.trim().split(/[ \t]+/)[0] ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const payload = lines.slice(timing + 1).map((line) => line.trim());
    if (!payload[0]) continue;
    const { image, at } = splitImageRef(payload[0]);
    if (!image) continue;
    if (at !== null) lastAt = at;
    doc.slides.push({
      start,
      end,
      image,
      at: at ?? lastAt,
      title: payload[1] ?? "",
      body: payload.slice(2).filter(Boolean).join("\n"),
    });
  }
  doc.slides.sort((a, b) => a.start - b.start);
  return doc;
}

/** The index entry to show: the first wanted language the stream has, else the first entry. */
export function pickRecapEntry(index: RecapIndex, wanted: (string | null | undefined)[]): RecapIndexEntry | null {
  const entries = index.recaps.filter((entry) => entry && typeof entry.url === "string" && entry.url);
  for (const language of wanted) {
    const match = entries.find((entry) => matchesLanguage(entry.language, language));
    if (match) return match;
  }
  return entries[0] ?? null;
}

/** Resolves the document's image paths against the VTT's URL. */
export function resolveRecap(doc: RecapDocument, vttUrl: string, entry?: RecapIndexEntry | null): Recap {
  return {
    language: doc.language ?? entry?.language ?? null,
    title: entry?.title || doc.title,
    url: vttUrl,
    slides: doc.slides.map((slide) => ({ ...slide, imageUrl: new URL(slide.image, vttUrl).href })),
  };
}

/** From this film position on the recap is offered: the first slide's moment. Null without slides. */
export function recapAvailableFrom(recap: Pick<Recap, "slides"> | null): number | null {
  if (!recap || recap.slides.length === 0) return null;
  return Math.min(...recap.slides.map((slide) => slide.at));
}

/** The slides the viewer has already seen the moment of: `at` at or before `position`. No spoilers. */
export function slidesUpTo<T extends Pick<RecapSlide, "at">>(slides: T[], position: number): T[] {
  return slides.filter((slide) => slide.at <= position + 0.5);
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, { signal, credentials: "omit" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function readIndex(text: string | null): RecapIndex | null {
  if (!text) return null;
  try {
    const json = JSON.parse(text) as Partial<RecapIndex> | null;
    if (!json || json.version !== 1 || !Array.isArray(json.recaps)) return null;
    return json as RecapIndex;
  } catch {
    return null;
  }
}

export type LoadRecapOptions = {
  cdnOrigin: string;
  streamId: string;
  /** An explicit VTT URL instead of the stream's `recaps/index.json`. */
  url?: string;
  /** Languages to try, best first (e.g. the viewer's UI language). */
  languages: (string | null | undefined)[];
  signal?: AbortSignal;
};

/**
 * The stream's recap in the best language, or null. Every failure (no index, 404, 403, a network or CORS error, odd
 * JSON, a VTT without slides) means "no recap" and stays silent.
 */
export async function loadRecap({ cdnOrigin, streamId, url, languages, signal }: LoadRecapOptions): Promise<Recap | null> {
  try {
    let vttUrl = url;
    let entry: RecapIndexEntry | null = null;
    if (!vttUrl) {
      const indexUrl = recapIndexUrl(cdnOrigin, streamId);
      const index = readIndex(await fetchText(indexUrl, signal));
      entry = index && pickRecapEntry(index, languages);
      if (!entry) return null;
      vttUrl = new URL(entry.url, indexUrl).href;
    } else {
      vttUrl = new URL(vttUrl, typeof location !== "undefined" ? location.href : undefined).href;
    }
    const text = await fetchText(vttUrl, signal);
    if (!text) return null;
    const recap = resolveRecap(parseRecapVtt(text), vttUrl, entry);
    return recap.slides.length > 0 ? recap : null;
  } catch {
    return null;
  }
}

type Labels = {
  recap: string;
  /** The control bar button's tooltip. */
  openRecap: string;
  previous: string;
  next: string;
  pause: string;
  play: string;
  close: string;
  continueWatching: string;
  slideOf: (n: number, total: number) => string;
};

const LABELS: Record<string, Labels> = {
  en: {
    recap: "Recap",
    openRecap: "Recap: the story so far",
    previous: "Previous slide",
    next: "Next slide",
    pause: "Pause slideshow",
    play: "Play slideshow",
    close: "Close recap",
    continueWatching: "Continue watching",
    slideOf: (n, total) => `Slide ${n} of ${total}`,
  },
  de: {
    recap: "Rückblick",
    openRecap: "Rückblick: was bisher geschah",
    previous: "Vorherige Folie",
    next: "Nächste Folie",
    pause: "Diashow anhalten",
    play: "Diashow abspielen",
    close: "Rückblick schließen",
    continueWatching: "Weiterschauen",
    slideOf: (n, total) => `Folie ${n} von ${total}`,
  },
  fr: {
    recap: "Résumé",
    openRecap: "Résumé : l’histoire jusqu’ici",
    previous: "Diapositive précédente",
    next: "Diapositive suivante",
    pause: "Mettre le diaporama en pause",
    play: "Lire le diaporama",
    close: "Fermer le résumé",
    continueWatching: "Reprendre la lecture",
    slideOf: (n, total) => `Diapositive ${n} sur ${total}`,
  },
  nl: {
    recap: "Samenvatting",
    openRecap: "Samenvatting: het verhaal tot nu toe",
    previous: "Vorige dia",
    next: "Volgende dia",
    pause: "Diavoorstelling pauzeren",
    play: "Diavoorstelling afspelen",
    close: "Samenvatting sluiten",
    continueWatching: "Verder kijken",
    slideOf: (n, total) => `Dia ${n} van ${total}`,
  },
};

/** The recap's texts in the viewer's language (en, de, fr, nl; English otherwise). */
export function recapLabels(language?: string): Labels {
  const lang = (language ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase().split("-")[0];
  return LABELS[lang] ?? LABELS.en;
}

/** The languages to look for, best first: the browser's (the viewer's UI), then the app's preferred ones. */
export function recapLanguages(...preferred: (string | null | undefined)[]): string[] {
  const ui = typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return [...ui, ...preferred].filter((l): l is string => !!l);
}
