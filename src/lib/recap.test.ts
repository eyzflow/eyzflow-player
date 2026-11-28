import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../fixtures/recap/r1/recap.de.1.vtt?raw";
import fixtureIndex from "../../fixtures/recap/index.json";
// The VTTs of the backend's sample package (shared/utils/recap-package/__fixtures__/sample.eyzrecap), as it writes them.
import backendDe from "../../fixtures/recap/backend-sample/recap.de.vtt?raw";
import backendEn from "../../fixtures/recap/backend-sample/recap.en.vtt?raw";
import {
  loadRecap,
  parseRecapVtt,
  parseTimestamp,
  pickRecapEntry,
  recapAvailableFrom,
  recapIndexUrl,
  recapLabels,
  condenseRecapSlides,
  resolveRecap,
  slidesUpTo,
  splitImageRef,
  type RecapIndex,
} from "./recap";

const index = fixtureIndex as RecapIndex;

describe("parseRecapVtt", () => {
  it("reads the header and every slide of the fixture", () => {
    const doc = parseRecapVtt(fixture);
    expect(doc.language).toBe("de");
    expect(doc.title).toBe("Kein Sterbenswort");
    expect(doc.slides).toHaveLength(4);
    expect(doc.slides[0]).toEqual({
      start: 0,
      end: 7,
      image: "images/001.jpg",
      at: 60,
      priority: null,
      title: "Der See",
      body: "Alex und Margot verbringen einen Sommerabend am See, wie jedes Jahr seit ihrer Kindheit.",
    });
    expect(doc.slides[1]).toMatchObject({ start: 7, end: 13.5, at: 120, title: "Der Anruf" });
    expect(doc.slides[1].body.split("\n")).toHaveLength(2);
  });

  it("gives a slide without #t the previous slide's moment", () => {
    const doc = parseRecapVtt(fixture);
    expect(doc.slides[2]).toMatchObject({ image: "images/003.jpg", at: 120 });
    expect(doc.slides[3].at).toBe(300);
  });

  it("takes 0 for leading slides without #t", () => {
    const doc = parseRecapVtt("WEBVTT\n\n00:00.000 --> 00:05.000\na.jpg\nA\n\n00:05.000 --> 00:09.000\nb.jpg#t=40\nB\n");
    expect(doc.slides.map((s) => s.at)).toEqual([0, 40]);
  });

  it("tolerates a BOM, CRLF, no cue ids, mm:ss timestamps and cue settings", () => {
    const text = "\uFEFFWEBVTT\r\n\r\nNOTE language: fr\r\n\r\n00:01.000 --> 00:06.500 line:90%\r\nimg/1.png#t=12.5\r\nTitre\r\nTexte\r\n";
    const doc = parseRecapVtt(text);
    expect(doc.language).toBe("fr");
    expect(doc.slides).toEqual([{ start: 1, end: 6.5, image: "img/1.png", at: 12.5, priority: null, title: "Titre", body: "Texte" }]);
  });

  it("skips cues without an image line or with bad times, and reads nothing that isn't WebVTT", () => {
    const doc = parseRecapVtt("WEBVTT\n\n1\n00:00.000 --> 00:05.000\n\n2\n00:09.000 --> 00:05.000\nx.jpg\nT\n");
    expect(doc.slides).toEqual([]);
    expect(parseRecapVtt("<html>Not found</html>").slides).toEqual([]);
    expect(parseRecapVtt("").slides).toEqual([]);
  });
});

describe("the backend's sample package", () => {
  it("reads both languages as the backend's own parser does", () => {
    const en = parseRecapVtt(backendEn);
    expect(en.language).toBe("en");
    expect(en.title).toBe("Sample");
    expect(en.slides).toEqual([
      { start: 0, end: 5, image: "images/001.png", at: 754, priority: null, title: "The call", body: "An email changes everything." },
      { start: 5, end: 10, image: "images/002.png", at: 1312, priority: null, title: "On the run", body: "The police are after him." },
    ]);
    const de = parseRecapVtt(backendDe);
    expect(de.language).toBe("de");
    expect(de.slides.map((s) => [s.image, s.at])).toEqual(en.slides.map((s) => [s.image, s.at]));
  });
});

describe("helpers", () => {
  it("parses timestamps", () => {
    expect(parseTimestamp("01:02:03.500")).toBe(3723.5);
    expect(parseTimestamp("02:03.5")).toBe(123.5);
    expect(Number.isNaN(parseTimestamp("soon"))).toBe(true);
  });

  it("splits the image from #t", () => {
    expect(splitImageRef("images/001.jpg#t=754")).toEqual({ image: "images/001.jpg", at: 754, priority: null });
    expect(splitImageRef("a.jpg#t=10,20")).toEqual({ image: "a.jpg", at: 10, priority: null });
    expect(splitImageRef("a.jpg#t=00:01:00")).toEqual({ image: "a.jpg", at: 60, priority: null });
    expect(splitImageRef("a.jpg#xywh=0,0,1,1")).toEqual({ image: "a.jpg", at: null, priority: null });
    expect(splitImageRef("a.jpg")).toEqual({ image: "a.jpg", at: null, priority: null });
  });

  it("reads the &p priority next to #t, 1 to 3 only", () => {
    expect(splitImageRef("images/007.jpg#t=3367&p=3")).toEqual({ image: "images/007.jpg", at: 3367, priority: 3 });
    expect(splitImageRef("a.jpg#p=2&t=10")).toEqual({ image: "a.jpg", at: 10, priority: 2 });
    expect(splitImageRef("a.jpg#t=10&p=1")).toEqual({ image: "a.jpg", at: 10, priority: 1 });
    expect(splitImageRef("a.jpg#t=10&p=4")).toEqual({ image: "a.jpg", at: 10, priority: null });
    expect(splitImageRef("a.jpg#t=10&p=")).toEqual({ image: "a.jpg", at: 10, priority: null });
    expect(splitImageRef("a.jpg#p=3")).toEqual({ image: "a.jpg", at: null, priority: 3 });
  });

  it("builds the index URL from the stream id", () => {
    expect(recapIndexUrl("https://stream.eyzflow.com", "s 1")).toBe("https://stream.eyzflow.com/s%201/recaps/index.json");
  });

  it("picks the wanted language, else the first", () => {
    expect(pickRecapEntry(index, ["en-GB", "de"])?.language).toBe("en");
    expect(pickRecapEntry(index, ["deu"])?.language).toBe("de");
    expect(pickRecapEntry(index, ["it", null])?.language).toBe("de");
    expect(pickRecapEntry({ version: 1, recaps: [] }, ["de"])).toBeNull();
  });

  it("resolves images against the VTT URL", () => {
    const recap = resolveRecap(parseRecapVtt(fixture), "https://cdn.test/s1/recaps/r1/recap.de.1.vtt");
    expect(recap.slides[0].imageUrl).toBe("https://cdn.test/s1/recaps/r1/images/001.jpg");
    expect(recap.title).toBe("Kein Sterbenswort");
  });

  it("offers slides only up to the film position", () => {
    const slides = resolveRecap(parseRecapVtt(fixture), "https://cdn.test/r/recap.de.1.vtt").slides;
    expect(recapAvailableFrom({ slides })).toBe(60);
    expect(recapAvailableFrom({ slides: [] })).toBeNull();
    expect(slidesUpTo(slides, 30)).toHaveLength(0);
    expect(slidesUpTo(slides, 60).map((s) => s.title)).toEqual(["Der See"]);
    expect(slidesUpTo(slides, 200).map((s) => s.title)).toEqual(["Der See", "Der Anruf", "Die Polizei"]);
    expect(slidesUpTo(slides, 5000)).toHaveLength(4);
  });

  it("has labels in en, de, fr and nl", () => {
    expect(recapLabels("de").recap).toBe("Rückblick");
    expect(recapLabels("nl-BE").continueWatching).toBe("Verder kijken");
    expect(recapLabels("xx").recap).toBe("Recap");
  });
});

/** A 95-minute film's recap as the backend now writes it: 27 slides, one every 210 s, priorities 1–3 (some missing). */
function denseRecap(): string {
  const cues = ["WEBVTT", "", "NOTE", "eyzrecap: 1", "language: en", "title: Dense", ""];
  for (let i = 0; i < 27; i++) {
    const at = (i + 1) * 210;
    const p = i % 9 === 4 ? "&p=3" : i % 3 === 0 ? "&p=2" : i % 5 === 1 ? "" : "&p=1";
    const ts = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
    cues.push(String(i + 1), `${ts(i * 6)} --> ${ts(i * 6 + 6)}`, `images/${String(i + 1).padStart(3, "0")}.jpg#t=${at}${p}`, `Slide ${i + 1}`, "One sentence.", "");
  }
  return cues.join("\n");
}

describe("condenseRecapSlides", () => {
  const slides = parseRecapVtt(denseRecap()).slides;
  const ats = (list: { at: number }[]) => list.map((s) => s.at);

  it("reads all 27 slides with their priorities", () => {
    expect(slides).toHaveLength(27);
    expect(slides.map((s) => s.priority).slice(0, 10)).toEqual([2, null, 1, 2, 3, 1, 2, 1, 1, 2]);
  });

  it("at 20 minutes shows the 5 slides so far, unchanged", () => {
    expect(ats(condenseRecapSlides(slides, 20 * 60))).toEqual([210, 420, 630, 840, 1050]);
  });

  it("at 50 minutes keeps the last 15 minutes and the most important earlier slides, 12 in film order", () => {
    // 14 slides so far (210 … 2940). Last 15 min (≥ 2100 s): 2100 … 2940, 5 slides. Room for 7 of the 9 earlier ones:
    // p3 at 1050; p2 at 1470, 840, 210; then p1 from the latest: 1890, 1680, 1260. Out: 630 (p1) and 420 (none).
    const shown = condenseRecapSlides(slides, 50 * 60);
    expect(shown).toHaveLength(12);
    expect(ats(shown)).toEqual([210, 840, 1050, 1260, 1470, 1680, 1890, 2100, 2310, 2520, 2730, 2940]);
  });

  it("at 90 minutes keeps the last 15 minutes and fills the rest by priority, the later winning ties", () => {
    // 25 slides so far (… 5250). Last 15 min (≥ 4500 s): 4620, 4830, 5040, 5250. Room for 8 of 21 earlier ones:
    // p3 at 2940 and 1050; then p2, latest first: 3990, 3360, 2730, 2100, 1470, 840. Out: p2 at 210, and every p1.
    const shown = condenseRecapSlides(slides, 90 * 60);
    expect(shown).toHaveLength(12);
    expect(ats(shown)).toEqual([840, 1050, 1470, 2100, 2730, 2940, 3360, 3990, 4620, 4830, 5040, 5250]);
  });

  it("counts a missing priority as 1 and keeps the 12 latest when the last 15 minutes alone hold more", () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({ at: i * 10, priority: i === 0 ? 3 : null }));
    expect(ats(condenseRecapSlides(flat, 190))).toEqual(ats(flat.slice(8)));
    const spread = Array.from({ length: 14 }, (_, i) => ({ at: i * 600, priority: i === 2 ? 1 : null }));
    // Last 15 min before 7800 s: 6600 and 7200 and 7800. The 9 earlier slides are all priority 1: the latest win.
    expect(ats(condenseRecapSlides(spread, 7800))).toEqual([1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600, 7200, 7800]);
  });
});

describe("loadRecap", () => {
  afterEach(() => vi.unstubAllGlobals());

  function serve(files: Record<string, string | number>) {
    const fetchMock = vi.fn(async (url: string) => {
      const body = files[url];
      if (body === undefined) return new Response("Not found", { status: 404 });
      if (typeof body === "number") return new Response("", { status: body });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const cdn = "https://cdn.test";
  const base = { cdnOrigin: cdn, streamId: "s1" };

  it("loads the wanted language through the index", async () => {
    serve({
      [`${cdn}/s1/recaps/index.json`]: JSON.stringify(index),
      [`${cdn}/s1/recaps/r1/recap.de.1.vtt`]: fixture,
    });
    const recap = await loadRecap({ ...base, languages: ["de-DE"] });
    expect(recap?.language).toBe("de");
    expect(recap?.slides).toHaveLength(4);
    expect(recap?.slides[3].imageUrl).toBe(`${cdn}/s1/recaps/r1/images/004.jpg`);
  });

  it("is null, quietly, without an index, on a 403, odd JSON, a missing VTT or a network error", async () => {
    serve({});
    expect(await loadRecap({ ...base, languages: [] })).toBeNull();
    serve({ [`${cdn}/s1/recaps/index.json`]: 403 });
    expect(await loadRecap({ ...base, languages: [] })).toBeNull();
    serve({ [`${cdn}/s1/recaps/index.json`]: "<html></html>" });
    expect(await loadRecap({ ...base, languages: [] })).toBeNull();
    serve({ [`${cdn}/s1/recaps/index.json`]: JSON.stringify({ version: 2, recaps: index.recaps }) });
    expect(await loadRecap({ ...base, languages: [] })).toBeNull();
    serve({ [`${cdn}/s1/recaps/index.json`]: JSON.stringify(index) });
    expect(await loadRecap({ ...base, languages: ["de"] })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await loadRecap({ ...base, languages: [] })).toBeNull();
  });

  it("reads an explicit VTT URL without the index, language and title from its header", async () => {
    const fetchMock = serve({ "https://other.test/x/recap.vtt": fixture });
    const recap = await loadRecap({ ...base, url: "https://other.test/x/recap.vtt", languages: ["en"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recap).toMatchObject({ language: "de", title: "Kein Sterbenswort" });
    expect(recap?.slides[0].imageUrl).toBe("https://other.test/x/images/001.jpg");
  });
});
