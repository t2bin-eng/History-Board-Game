// HTML 파일 페이지를 srcdoc 액자로 띄울 때 넣는 작은 안내 스크립트 (v0.33.1, SPEC 6장 "HTML 페이지").
//
// srcdoc 문서의 기준 주소(base URL)는 그 문서가 아니라 바깥 문서(레슨덱 앱)다. 그래서 `<a href="#step2">` 같은
// 문서 안 이동 링크가 `https://레슨덱/#step2`로 풀려, 누르면 액자가 레슨덱 앱 주소로 넘어가며 하얗게 됐다
// (다른 브라우저에서 파일로 열면 파일 자신이 기준이라 문제없음). 그래서
// - `#…` 링크는 그 문서 안에서 그 자리로 옮기고 (`location.hash` → about:srcdoc#…, :target·hashchange도 그대로)
// - 레슨덱 앱 주소로 풀리는 그 밖의 링크·양식 제출(다른 파일 이름, action 없는 form)은 막는다 (열 파일이 없음)
// 페이지 스크립트가 먼저 처리했으면(preventDefault) 건드리지 않는다. 새 창(target=_blank) 링크는 그대로.
// 또 (v0.36) 문서가 스크롤될 때마다 그 위치를 앱에 알린다 — 필기·형광펜이 웹앱 글자를 따라 움직이게
// (SPEC 5장 "HTML 페이지 필기는 웹앱 문서에 붙는다"). 액자는 sandbox라 앱이 직접 읽을 수 없다.

const GUARD = `<script data-lessondeck-guard>(function(){
var app;try{app=new URL(document.baseURI).origin}catch(e){return}
function self(el){var t=(el.getAttribute("target")||"").toLowerCase();return!t||t==="_self"}
function go(h){var id=h.slice(1);try{id=decodeURIComponent(id)}catch(e){}
var el=id?(document.getElementById(id)||document.getElementsByName(id)[0]||null):null;
var top=!el&&(!id||id.toLowerCase()==="top");
try{if(location.hash!==h&&(el||top||!id)){location.hash=h;if(top)window.scrollTo(0,0);return}}catch(e){}
if(el)el.scrollIntoView();else if(top)window.scrollTo(0,0)}
window.addEventListener("click",function(e){
if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey)return;
var a=e.target&&e.target.closest?e.target.closest("a[href],area[href]"):null;
if(!a||!self(a))return;
var h=a.getAttribute("href")||"";
if(h.charAt(0)==="#"){e.preventDefault();go(h);return}
var u;try{u=new URL(a.href)}catch(x){return}
if(u.origin===app)e.preventDefault()});
window.addEventListener("submit",function(e){
if(e.defaultPrevented)return;var f=e.target;if(!f||!f.getAttribute||!self(f))return;
var o;try{o=new URL(f.getAttribute("action")||"",document.baseURI).origin}catch(x){return}
if(o===app)e.preventDefault()});
var sx=-1,sy=-1;
function rep(){var x=Math.round(window.scrollX||window.pageXOffset||0),y=Math.round(window.scrollY||window.pageYOffset||0);
if(x===sx&&y===sy)return;sx=x;sy=y;
try{parent.postMessage({lessondeck:"scroll",x:x,y:y,w:window.innerWidth,h:window.innerHeight},"*")}catch(e){}}
window.addEventListener("scroll",rep,{passive:true});
window.addEventListener("resize",function(){sx=-1;rep()});
window.addEventListener("load",rep);
rep();
})();</script>`;

/** 문서 맨 앞(머리 안)에 안내 스크립트를 넣는다. <!DOCTYPE> 앞에 넣으면 호환 모드가 되므로 그 뒤에 */
export function guardHtml(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return insertAt(html, head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return insertAt(html, root.index + root[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return insertAt(html, doctype[0].length);
  return GUARD + html;
}

function insertAt(html: string, at: number): string {
  return html.slice(0, at) + GUARD + html.slice(at);
}
