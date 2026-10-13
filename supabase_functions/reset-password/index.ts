// Supabase Edge Function: reset-password
// Mailsiz şifre sıfırlama: ekip kodunu bilen, listede AKTİF ve giriş yetkili bir kişi
// kendi şifresini yeniden belirleyebilir.
// KURULUM:  supabase functions deploy reset-password --no-verify-jwt
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY otomatik gelir)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { person_id, code, new_password } = await req.json();
    if (!person_id || !code || !new_password || String(new_password).length < 6)
      return reply({ ok: false, error: "Eksik veya geçersiz bilgi (şifre en az 6 karakter)." }, 400);

    const { data: s } = await admin.from("finance_settings").select("value").eq("key", "invite_code_hash").maybeSingle();
    if (!s || (await sha256Hex(String(code).trim())) !== s.value)
      return reply({ ok: false, error: "Ekip kodu hatalı." }, 403);

    const { data: p } = await admin.from("people").select("email, active, can_login").eq("id", person_id).maybeSingle();
    if (!p || !p.active || !p.can_login) return reply({ ok: false, error: "Bu hesap için işlem yapılamaz." }, 403);

    let user: any = null;
    for (let page = 1; page <= 20 && !user; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      user = data.users.find((u: any) => (u.email || "").toLowerCase() === p.email.toLowerCase());
      if (data.users.length < 1000) break;
    }
    if (!user) return reply({ ok: false, error: "Bu kişi için henüz hesap yok. 'İlk Kez Giriş' sekmesini kullanın." }, 404);

    const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { password: String(new_password) });
    if (upErr) throw upErr;
    return reply({ ok: true });
  } catch (e) {
    return reply({ ok: false, error: String(e) }, 500);
  }
});
