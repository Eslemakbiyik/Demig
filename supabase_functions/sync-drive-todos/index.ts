// Supabase Edge Function: sync-drive-todos
// Her Perşembe 12:00'de (İstanbul) çalışır: Çarşamba günleri güncellenen toplantı notu dosyasını
// çeker, günlerin altındaki tabloları (kişi | yapılacaklar) okur, kişileri proje ekibiyle eşler ve
// meeting_action_items tablosuna "pending" (onay bekliyor) olarak yazar. Aynı madde ikinci kez eklenmez.
//
// KURULUM:
//   supabase functions deploy sync-drive-todos --no-verify-jwt
//   supabase secrets set MEETING_NOTES_URL="<Google Doc linki>"   (dosya: "Bağlantıya sahip herkes görüntüleyebilir")
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

function parseHtml(html: string): Item[] {
  const items: Item[] = [];
  const year = new Date().getFullYear();
  // gövdeyi "tablo" ve "diğer" parçalarına böl; tablodan önceki son tarih içeren metin o günün tarihidir
  const parts = html.split(/(<table[\s\S]*?<\/table>)/gi);
  let curDate: string | null = null;
  for (const part of parts) {
    if (/^<table/i.test(part)) {
      if (!curDate) continue;
      const rows = part.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      rows.forEach((r, ri) => {
        const cells = (r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(decode);
        if (cells.length < 2) return;
        if (ri === 0 && /kişi|isim|ad\b|name|sorumlu/i.test(cells[0])) return; // başlık satırı
        const person = cells[0].trim();
        const text = cells.slice(1).join(" ").trim();
        if (!person || !text) return;
        // hücredeki satırları ayrı madde say
        text.split(/\n|•|;\s+(?=[A-ZÇĞİÖŞÜ])/).map((t) => t.replace(/^[-*\d.)\s]+/, "").trim()).filter((t) => t.length > 3)
          .forEach((t) => items.push({ date: curDate!, person, text: t }));
      });
    } else {
      const lines = decode(part).split("\n");
      for (const ln of lines) { const d = parseDate(ln, year); if (d) curDate = d; }
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
    const url = Deno.env.get("MEETING_NOTES_URL");
    if (!url) return new Response(JSON.stringify({ ok: false, error: "MEETING_NOTES_URL tanımlı değil" }), { status: 500 });
    const res = await fetch(exportUrl(url));
    if (!res.ok) throw new Error(`Dosya indirilemedi: ${res.status} (paylaşım ayarı 'bağlantıya sahip herkes' olmalı)`);
    const body = await res.text();
    const items = /^<|<html/i.test(body.trim()) ? parseHtml(body) : parseCsv(body);

    const { data: people } = await sb.from("people").select("id, name, active").eq("active", true);
    const find = (n: string) => {
      const t = norm(n); if (!t) return null;
      return (people || []).find((p: any) => norm(p.name) === t)
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
    return new Response(JSON.stringify({ ok: true, found: items.length, added, skipped, unmatched }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
