// =====================================================================
// DEMIG · Drive toplantı notları çıkarıcı
// Ne yapar: Google Drive'daki "DEMIG – Meeting Notes" dokümanını (bağlantıyla görüntülenebilir)
// HTML olarak dışa aktarır, her toplantı başlığını (ör. "2 Kasım 2026 (Pazartesi): DEMIG Toplantı")
// bölümleri ve "Görevler" tablosuyla birlikte ayırır ve DEMIG sitesine "#drive-import=" ile gönderir.
// Nasıl çalıştırılır: dokümanın kendi sekmesinde (docs.google.com/document/d/<id>/...) tarayıcı
// konsolunda / otomasyon aracında bu dosyanın içeriği olduğu gibi çalıştırılır. Site tarafı
// (index.html › mtgMaybeDriveImport) Eslem'in hesabında bir onay şeridi gösterir; "Aktar" denince
// notlar ilgili oturumların Notlar sekmesine, görevler "Onay Bekleyen"e yazılır.
// İsteğe bağlı ayarlar (çalıştırmadan önce):
//   window.__DEMIG_SINCE  = 'YYYY-MM-DD'  → bu tarihten eski toplantılar alınmaz (varsayılan 14 gün önce)
//   window.__DEMIG_AGENDA = [{ date, track, items: [...], note }]  → bir sonraki toplantıya devreden gündem
//   window.__DEMIG_NO_NAV = true          → siteye gitmeden sadece özet döndür (deneme için)
// =====================================================================
await (async () => {
  const __demigDocId = (location.pathname.match(/\/document\/d\/([^/]+)/) || [])[1];
  const __demigSite = 'https://eslemakbiyik.github.io/Demig/';
  const __demigSince = window.__DEMIG_SINCE || new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const __demigMonths = { ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12 };
  const __demigHtml = await (await fetch(`/document/d/${__demigDocId}/export?format=html`, { credentials: 'include' })).text();
  let __demigPol = null; try { __demigPol = trustedTypes.createPolicy('demigextract' + Date.now(), { createHTML: s => s }); } catch (e) {}
  const __demigDoc = new DOMParser().parseFromString(__demigPol ? __demigPol.createHTML(__demigHtml) : __demigHtml, 'text/html');
  const __demigTxt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const __demigMeetings = []; let __m = null, __sec = null;
  __demigDoc.body.querySelectorAll('h1,h2,h3,h4,p,li,table').forEach(el => {
    if (el.tagName !== 'TABLE' && el.closest('table')) return;
    if (el.tagName === 'H1' || el.tagName === 'H2') {
      const t = __demigTxt(el);
      const mm = t.toLocaleLowerCase('tr-TR').match(/^(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/);
      __m = null; __sec = null;
      if (mm && __demigMonths[mm[2]]) {
        const date = `${mm[3]}-${String(__demigMonths[mm[2]]).padStart(2, '0')}-${mm[1].padStart(2, '0')}`;
        if (date >= __demigSince) { __m = { date, title: t, headingId: el.id || null, sections: [], tasks: [], source: '' }; __demigMeetings.push(__m); }
      }
      return;
    }
    if (!__m) return;
    if (el.tagName === 'H3' || el.tagName === 'H4') { __sec = { title: __demigTxt(el), lines: [] }; __m.sections.push(__sec); return; }
    if (el.tagName === 'TABLE') {
      const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(__demigTxt));
      const head = (rows[0] || []).map(x => x.toLocaleLowerCase('tr-TR'));
      const iWho = head.findIndex(x => /^(kim|kişi|sorumlu)/.test(x)), iTask = head.findIndex(x => /^görev/.test(x));
      const iDue = head.findIndex(x => /son tarih/.test(x)), iBasis = head.findIndex(x => /dayanak/.test(x));
      if (iWho >= 0 && iTask >= 0) rows.slice(1).forEach(r => { if (r[iWho] && r[iTask]) __m.tasks.push({ who: r[iWho], task: r[iTask], due: iDue >= 0 ? r[iDue] : '', basis: iBasis >= 0 ? r[iBasis] : '' }); });
      return;
    }
    const t = __demigTxt(el); if (!t) return;
    if (/^Kaynak:/i.test(t)) { __m.source = t; return; }
    if (!__sec) { __sec = { title: '', lines: [] }; __m.sections.push(__sec); }
    if (el.tagName === 'LI') { __sec.lines.push('• ' + t); return; }
    // "Katılanlar: ... - Arka plan: ... - Öğrenci takibi: ..." gibi tek paragrafa sıkışmış maddeleri ayır
    const parts = t.split(/\s+-\s+(?=[A-ZÇĞİÖŞÜ“"(])/);
    parts.forEach((p, i) => __sec.lines.push(i === 0 && parts.length > 1 && /^Katılanlar/i.test(p) ? p : (parts.length > 1 ? '• ' + p : p)));
  });
  const __demigPayload = {
    v: 1, docId: __demigDocId, docUrl: `https://docs.google.com/document/d/${__demigDocId}/edit`,
    extractedAt: new Date().toISOString(), since: __demigSince,
    meetings: __demigMeetings.map(m => ({ ...m, sections: m.sections.filter(s => s.lines.length && !/^(konular|görevler)$/i.test(s.title)) })),
    agenda: window.__DEMIG_AGENDA || []
  };
  window.__demigPayload = __demigPayload;   // otomasyon notların metnini buradan okuyabilir (ör. devreden gündem için)
  const __demigSummary = { since: __demigSince, meetings: __demigPayload.meetings.map(m => ({ date: m.date, sections: m.sections.length, tasks: m.tasks.length })), agenda: __demigPayload.agenda.length };
  if (!window.__DEMIG_NO_NAV) {
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(__demigPayload))));
    setTimeout(() => { location.href = __demigSite + '#drive-import=' + enc; }, 50);
  }
  return __demigSummary;
})()
