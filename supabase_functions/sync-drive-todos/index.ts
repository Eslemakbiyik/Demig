// Supabase Edge Function: sync-drive-todos
// Her Cuma 09:00'da (İstanbul) çalışır: toplantı notu dosyasını çeker, günlerin altındaki tabloları
// (kişi | yapılacaklar) okur, kişileri proje ekibinin tekil isimleriyle eşler ve meeting_action_items
// tablosuna "pending" olarak yazar (source=drive_sync). Portal bir yönetici tarafından açıldığında
// kişisi eşleşen bu maddeler otomatik onaylanır, haftalık göreve dönüşür ve kişi başına tek mail gider.
// Ayrıca günün toplantı notlarını (görev dışı bölümler) meeting_records'a yazar (o kayıt boşsa).
// Aynı madde ikinci kez eklenmez.
//
// KURULUM:
//   supabase functions deploy sync-drive-todos --no-verify-jwt
//   (isteğe bağlı) supabase secrets set MEETING_NOTES_URL="<başka bir Google Doc linki>" — tanımlı değilse DEMIG Toplantı Notları dokümanı kullanılır
//   ardından drive_sync_cron.sql dosyasını çalıştırın (zamanlama).
//
// Google Doc linki https://docs.google.com/document/d/<ID>/edit ise otomatik olarak
// .../export?format=html adresine çevrilir. Google Sheet ise export?format=csv kullanılır.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7,
  ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();

function exportUrl(u: string) {
  const m = u.match(/docs\.google\.com\/(document|spreadsheets)\/d\/([^/]+)/);
  if (!m) return u;
  return m[1] === "document"
    ? `https://docs.google.com/document/d/${m[2]}/export?format=html`
    : `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=csv`;
}

// "15 Ekim 2025", "Çarşamba, 15 Ekim", "15.10.2025" → YYYY-MM-DD
function parseDate(text: string, fallbackYear: number): string | null {
  let m = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = text.toLocaleLowerCase("tr-TR").match(/(\d{1,2})\s+([a-zçğıöşü]+)(?:\s+(\d{4}))?/);
  if (m && MONTHS[m[2]]) return `${m[3] || fallbackYear}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

type Item = { date: string; person: string; text: string };
const notesByDate: Record<string, string> = {};

function parseHtml(html: string): Item[] {
  for (const k of Object.keys(notesByDate)) delete notesByDate[k];
  // Doküman yapısı: <h2> "12 Ekim 2026 (Pazartesi): DEMIG Toplantı" → <h3> "Sonraki adımlar" → <h4> kişi → <li> madde
  // ve bazı toplantılarda <h3> "Görevler" altında Kim | Görev | Son tarih | Dayanak tablosu.
  const items: Item[] = [];
  const year = new Date().getFullYear();
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, "");
  const tok = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<li[^>]*>([\s\S]*?)<\/li>|(<table[\s\S]*?<\/table>)|<p[^>]*>([\s\S]*?)<\/p>/gi;
  let date: string | null = null, section = "", person = "", m: RegExpExecArray | null;
  const wanted = (sec: string) => /sonraki ad[ıi]mlar|g[öo]revler|yap[ıi]lacaklar|aksiyon/i.test(sec);
  while ((m = tok.exec(body))) {
    if (m[1]) {
      const lvl = parseInt(m[1][1], 10), text = decode(m[2]);
      if (lvl <= 2) { date = parseDate(text, year); section = ""; person = ""; }
      else if (lvl === 3) { section = text; person = ""; if (date && text && !wanted(text)) notesByDate[date] = (notesByDate[date] || "") + `\n${text}\n`; }
      else if (lvl === 4) { person = text; if (date && text && !wanted(section)) notesByDate[date] = (notesByDate[date] || "") + `${text}\n`; }
    } else if (m[5] !== undefined) {
      const t = decode(m[5]);
      if (date && t && section && !wanted(section)) notesByDate[date] = (notesByDate[date] || "") + t + "\n";
    } else if (m[3] !== undefined) {
      if (date && section && !wanted(section)) { const t0 = decode(m[3]).replace(/^[-*•\s]+/, "").trim(); if (t0) notesByDate[date] = (notesByDate[date] || "") + "• " + t0 + "\n"; }
      if (!date || !wanted(section) || !person) continue;
      const t = decode(m[3]).replace(/^[-*•\s]+/, "").trim();
      if (t.length > 3 && !/^\[?…\]?$/.test(t)) items.push({ date, person, text: t });
    } else if (m[4]) {
      if (!date || !wanted(section)) continue;
      const rows = m[4].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      rows.forEach((r, ri) => {
        const cells = (r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(decode);
        if (cells.length < 2 || (ri === 0 && /^(kim|ki[şs]i|isim|sorumlu)/i.test(cells[0]))) return;
        const who = cells[0].replace(/\(\?\)/g, "").trim(), task = cells[1].trim();
        const due = cells[2] && cells[2] !== "—" ? ` (Son tarih: ${cells[2]})` : "";
        if (who && task) items.push({ date: date!, person: who, text: task + due });
      });
    }
  }
  return items;
}

function parseCsv(csv: string): Item[] {
  // Sheet: ilk sütun tarih/kişi karışık olabilir; basit biçim: tarih | kişi | yapılacak
  const items: Item[] = [];
  const year = new Date().getFullYear();
  let cur: string | null = null;
  for (const line of csv.split(/\r?\n/)) {
    const c = line.split(",").map((x) => x.replace(/^"|"$/g, "").trim());
    const d = parseDate(c[0] || "", year);
    if (d) { cur = d; if (c[1] && c[2]) items.push({ date: d, person: c[1], text: c.slice(2).join(" ") }); continue; }
    if (cur && c[0] && c[1]) items.push({ date: cur, person: c[0], text: c.slice(1).join(" ") });
  }
  return items;
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("MEETING_NOTES_URL") || "https://docs.google.com/document/d/1j7LOlgUqwCC1Of001aciPP8Z0eWIkLQa/edit";
    if (!url) return new Response(JSON.stringify({ ok: false, error: "MEETING_NOTES_URL tanımlı değil" }), { status: 500 });
    const res = await fetch(exportUrl(url));
    if (!res.ok) throw new Error(`Dosya indirilemedi: ${res.status} (paylaşım ayarı 'bağlantıya sahip herkes' olmalı)`);
    const body = await res.text();
    const all = /^<|<html/i.test(body.trim()) ? parseHtml(body) : parseCsv(body);
    // yalnızca son 14 günün toplantıları (eski toplantılar panele yığılmasın)
    const minDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const items = all.filter((i) => i.date >= minDate);

    const { data: people } = await sb.from("people").select("id, name, active, grp").eq("active", true).neq("grp", "annotator");
    const find = (n: string) => {
      let t = norm(n); if (!t) return null;
      if (t === "galata") t = "ahmet utku akbıyık"; // Zoom'da Ahmet Utku Akbıyık "Galata" olarak geçiyor
      return (people || []).find((p: any) => norm(p.name) === t)
        || (people || []).find((p: any) => norm(p.name).startsWith(t + " ") && t.includes(" "))
        || (people || []).find((p: any) => norm(p.name).split(" ")[0] === t.split(" ")[0])
        || (people || []).find((p: any) => t.includes(norm(p.name).split(" ")[0]));
    };

    let added = 0, skipped = 0, unmatched = 0;
    for (const it of items) {
      const { data: ex } = await sb.from("meeting_action_items").select("id").eq("week_date", it.date).eq("raw_text", it.text).limit(1);
      if (ex && ex.length) { skipped++; continue; }
      const p = find(it.person);
      if (!p) unmatched++;
      const { error } = await sb.from("meeting_action_items").insert({
        week_date: it.date, raw_text: it.text,
        suggested_person_id: p ? p.id : null, suggested_person_name: p ? p.name : it.person,
        status: "pending", source: "drive_sync",
      });
      if (!error) added++;
    }
    // Toplantı notları: ilgili günün ilk görüşme kaydı boşsa doküman notlarını yaz
    let notesWritten = 0;
    for (const [d, txt] of Object.entries(notesByDate)) {
      if (d < minDate) continue;
      const text = txt.replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
      if (text.length < 20) continue;
      const { data: ex } = await sb.from("meeting_records").select("action_text").eq("week_date", d).eq("track_id", "other_side").limit(1);
      if (ex && ex.length && ex[0].action_text) continue;
      const { error } = await sb.from("meeting_records").upsert({ week_date: d, track_id: "other_side", action_text: text, updated_by: "Drive senkron" }, { onConflict: "week_date,track_id" });
      if (!error) notesWritten++;
    }
    return new Response(JSON.stringify({ ok: true, found: items.length, added, skipped, unmatched, notesWritten }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
