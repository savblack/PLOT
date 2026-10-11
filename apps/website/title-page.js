/* global posthog, dataLayer, gtag */
/* eslint-disable no-unused-vars, no-empty -- Browser analytics bootstrap retains the vendor snippet's callback signatures. */
/*
 * Public title-page behavior. This is intentionally static: it is shared by
 * every rendered title page and keeps analytics, attribution and navigation
 * code out of each Supabase Edge Function response.
 */
if (['theplot.tv','www.theplot.tv','app.theplot.tv'].indexOf(location.hostname)>-1) {
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
/* Report unhandled errors and promise rejections to PostHog Error Tracking.
   Only the app had this; these server-rendered pages ship real JavaScript to
   real visitors and produced no error signal at all. The host gate above is
   the dev gate, same as it is for pageviews.
   dropOpaqueException discards the browser's opaque cross-origin "Script
   error." — no message, no filename, no stack, so it can only ever be closed,
   never diagnosed. Mirrors isOpaqueBrowserException in
   apps/web/src/utils/opaqueException.js: an entry qualifies only when it is
   BOTH synthetic and frameless, so a real throw is never dropped. Four copies
   of this live in the tree (here, the other two rendered surfaces, and
   apps/website/js/config.js) because none of them can import. Keep in step. */
function dropOpaqueException(e){if(!e||e.event!=='$exception')return e;var L=e.properties&&e.properties.$exception_list;if(!Array.isArray(L)||!L.length)return e;return L.every(function(x){if(!x||typeof x!=='object')return false;if(!x.mechanism||x.mechanism.synthetic!==true)return false;var F=x.stacktrace&&x.stacktrace.frames;return !(F&&F.length>0);})?null:e;}
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U',{api_host:'https://a.theplot.tv',ui_host:'https://us.posthog.com',person_profiles:'identified_only',persistence:'localStorage+cookie',cross_subdomain_cookie:true,capture_pageview:true,autocapture:true,capture_exceptions:true,before_send:dropOpaqueException});
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="app.theplot.tv/"]');if(!a)return;var path;try{path=new URL(a.href).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_cta_clicked':path.indexOf('/login')===0?'login_click':path.indexOf('/save')===0?'save_cta_clicked':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'title_page',source:'title_page'});},true);
/* Forward this visit's real acquisition params onto the app links, so a
   visitor who arrived here from social or search keeps their true source
   across the hop. Mirrors forwardAttribution in apps/website/js/config.js.
   Existing params win, so each page's own ?src= identity survives. */
document.addEventListener('DOMContentLoaded',function(){var K=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid','ref','src'],H=new URLSearchParams(location.search),C=new URLSearchParams();K.forEach(function(k){if(H.get(k))C.set(k,H.get(k));});try{var R=document.referrer&&new URL(document.referrer).hostname;if(R&&R!==location.hostname)C.set('referrer',R);}catch(e){}if(C.toString()){document.querySelectorAll('a[href*="app.theplot.tv/"],a[href^="/signup"],a[href^="/login"]').forEach(function(a){try{var u=new URL(a.href,location.origin);C.forEach(function(v,k){if(!u.searchParams.has(k))u.searchParams.set(k,v);});a.href=u.toString();}catch(e){}});}});
}

if (['theplot.tv','www.theplot.tv','app.theplot.tv'].indexOf(location.hostname)>-1) {
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};
gtag('js',new Date());gtag('config','G-PYLHY9JMK1');
var g=document.createElement('script');g.async=true;g.crossOrigin='anonymous';g.src='https://www.googletagmanager.com/gtag/js?id=G-PYLHY9JMK1';document.head.appendChild(g);
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.crossOrigin='anonymous';j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PC72PHBN');
}

(function () {
    var nav = document.getElementById('topnav');
    var update = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', update, { passive: true });
    update();
    var hamburger = document.getElementById('hamburger');
    var navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
      var setOpen = function (open) {
        navLinks.classList.toggle('open', open);
        hamburger.classList.toggle('open', open);
        nav.classList.toggle('nav-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
      };
      hamburger.addEventListener('click', function () { setOpen(!navLinks.classList.contains('open')); });
      navLinks.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
      document.addEventListener('click', function (e) { if (navLinks.classList.contains('open') && !e.target.closest('nav') && !e.target.closest('.nav-links')) { setOpen(false); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navLinks.classList.contains('open')) { setOpen(false); hamburger.focus(); } });
    }
  })();
