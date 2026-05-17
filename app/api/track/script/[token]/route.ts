// GET /api/track/script/:token
//
// Serves the tracker JS pre-bound to a specific site_token. The user
// embeds <script async src="https://app.perennial.design/api/track/script/<TOKEN>"></script>
// on their site once; we ship updates to the tracker by changing this
// route — no need for the user to re-paste a new snippet.
//
// The script:
//   1. Fires a pageview on load
//   2. Hooks history.pushState / popstate so SPA navigations are tracked
//   3. Uses sendBeacon when available so events ship even on tab close
//   4. Skips ?perennial-track=0 to let users opt out for local dev

export const runtime = "edge"; // tiny, no DB — Edge is fine and cheaper

const CACHE_HEADERS = {
  "Content-Type":  "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
} as const;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || !/^[A-Za-z0-9+/=_-]{1,32}$/.test(token)) {
    return new Response("// invalid token", { status: 400, headers: CACHE_HEADERS });
  }
  const safeToken = JSON.stringify(token);

  // The base origin for /api/track. Hardcoded to the production origin
  // because the script runs on third-party sites, not on app.perennial.design
  // itself, and process.env.NEXT_PUBLIC_APP_URL isn't accessible at
  // request time in the Edge runtime for this route in a useful way.
  const ingestUrl = "https://app.perennial.design/api/track";

  const script = `
(function(){
  var T=${safeToken};
  var U=${JSON.stringify(ingestUrl)};
  if(location.search.indexOf("perennial-track=0")>=0)return;
  function ping(){
    var body=JSON.stringify({t:T,u:location.pathname+location.search,r:document.referrer||null});
    if(navigator.sendBeacon){
      try{navigator.sendBeacon(U,new Blob([body],{type:"application/json"}));return;}catch(e){}
    }
    fetch(U,{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true,credentials:"omit"}).catch(function(){});
  }
  ping();
  var push=history.pushState;
  history.pushState=function(){var r=push.apply(this,arguments);ping();return r;};
  var replace=history.replaceState;
  history.replaceState=function(){var r=replace.apply(this,arguments);ping();return r;};
  window.addEventListener("popstate",ping);
})();
  `.trim();

  return new Response(script, { headers: CACHE_HEADERS });
}
