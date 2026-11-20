// Cloudflare Worker: narrowly scoped Deck Log proxy, no general-purpose URL fetching.
// Configure ALLOWED_ORIGIN in Worker environment variables before deployment.
const API = "https://decklog.bushiroad.com/system/app/api/view/";
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = env.ALLOWED_ORIGIN || "https://naninunenonano.github.io";
    const headers = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": "no-store"
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: {...headers, "Content-Type": "application/json; charset=utf-8"}
    });
    if (origin && origin !== allowed) return reply({error:"Origin not allowed"},403);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
    if (request.method !== "GET") return reply({error:"Method not allowed"},405);
    const url = new URL(request.url);
    if (url.pathname === "/health") return reply({ok:true,service:"ws-decklog-proxy"});
    const match = url.pathname.match(/^\/deck\/([A-Za-z0-9]{4,12})\/?$/);
    if (!match) return reply({error:"Invalid deck code"},400);
    try {
      const upstream = await fetch(API + match[1].toUpperCase(), {
        method:"POST",
        headers:{
          "Accept":"application/json, text/plain, */*",
          "Content-Type":"application/json",
          "Origin":"https://decklog.bushiroad.com",
          "Referer":"https://decklog.bushiroad.com/view/" + match[1].toUpperCase()
        },
        body:"null",
        signal:AbortSignal.timeout(12000)
      });
      if (!upstream.ok) return reply({error:"Deck Log upstream HTTP "+upstream.status},502);
      const data = await upstream.json();
      if (!data || !Array.isArray(data.list)) return reply({error:"Unexpected Deck Log response"},502);
      // Expose only deck title and card codes/counts; do not relay arbitrary upstream data.
      return reply({
        title:typeof data.title === "string" ? data.title : "Deck Log",
        list:data.list.map(c=>({card_number:c.card_number,num:c.num}))
      });
    } catch (e) {
      return reply({error:"Deck Log request failed",detail:String(e?.message||e)},502);
    }
  }
};
