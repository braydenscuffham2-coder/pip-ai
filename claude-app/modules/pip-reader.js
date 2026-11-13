// Extracted from claude-app/pip.html (<script id="pip-reader">). Edit the build, not this copy.
/* Pip Reader: website reads go through the "Pip Reader" connector, which works in
   every Claude app (phone, web, desktop). If this viewer hasn't added or allowed it,
   fall back to the desktop app's browser, as before. */
(function(){
  var SERVER="PIP Reader", TOOL="pip_read";
  var MISSING=/^(server_not_connected|not_in_manifest|not_granted|capability_disabled|capability_removed|selection_required|server_not_found|needs_reauth|blocked_by_policy|approval_required|consent_required|bad_request)$/;
  var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
  function text(r){
    if(!r)return "";
    var c=(r.content||[]).map(function(b){return b&&typeof b.text=="string"?b.text:""}).join("");
    if(c)return c;
    var p=r.payload;
    return typeof p=="string"?p:(p==null?"":JSON.stringify(p));
  }
  async function viaConnector(m,url,max){
    var r=await m.callTool(SERVER,TOOL,{url:url},{cache:false});
    return {payload:text(r).slice(0,max||4e5)};
  }
  window.__pipRead=async function(m,url,max){
    try{return await viaConnector(m,url,max)}
    catch(e){
      var code=String(e&&e.code||"");
      if(e&&e.retryable){
        /* A read, so one retry is safe: e.g. the first call's consent prompt was busy. */
        await sleep(Math.min(Number(e.retryAfterMs)||1200,8000)+Math.random()*600);
        try{return await viaConnector(m,url,max)}
        catch(e2){code=String(e2&&e2.code||"");if(!MISSING.test(code))throw e2}
      }else if(!MISSING.test(code))throw e;
    }
    await m.callTool("host:claude_browser","navigate",{url:url});
    return await m.callTool("host:claude_browser","get_page_text",{max_chars:max||4e5});
  };
})();
