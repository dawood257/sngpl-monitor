(function(){
'use strict';

function formatBytes(kb) {
  kb = Number(kb) || 0;
  if (kb < 1024) return kb.toFixed(0) + " KB/s";
  if (kb < 1024 * 1024) return (kb / 1024).toFixed(1) + " MB/s";
  return (kb / 1024 / 1024).toFixed(2) + " GB/s";
}

var RANGE="24h",TAB="overview",_builtFor=null;
var css=".perf-tabs{display:flex;gap:4px;margin:0 0 16px;border-bottom:1px solid #334155}"
+".perf-tab{padding:10px 18px;background:transparent;border:0;color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}"
+".perf-tab:hover{color:#e2e8f0}"
+".perf-tab.active{color:#38bdf8;border-bottom-color:#38bdf8}"
+".perf-pane{display:none}.perf-pane.active{display:block}"
+".time-range{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}"
+".time-btn{padding:6px 14px;background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}"
+".time-btn:hover{background:#243044;color:#e2e8f0}"
+".time-btn.active{background:#38bdf8;color:#0f172a;border-color:#38bdf8}"
+".chart-card-perf{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;margin-bottom:14px}"
+".chart-head-perf{font-size:12px;font-weight:700;color:#e2e8f0;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}"
+".chart-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}"
+".stat-mini{background:#0f172a;border:1px solid #334155;border-radius:6px;padding:8px 10px}"
+".stat-mini-label{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}"
+".stat-mini-val{font-size:15px;font-weight:800;color:#e2e8f0;font-variant-numeric:tabular-nums}"
+".chart-container{height:200px;width:100%;position:relative}"
+".no-data{text-align:center;padding:40px 20px;color:#64748b;font-size:13px}"
+"@media(max-width:700px){.chart-stats{grid-template-columns:repeat(2,1fr)}}";
var storageCss=".storage-table{max-width:800px;margin:0 auto;font-family:'JetBrains Mono','SF Mono',Consolas,monospace}"
+".storage-header{display:grid;grid-template-columns:1.2fr .7fr 1.4fr 1.5fr;gap:14px;padding:10px 0;border-bottom:1px solid #334155;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}"
+".storage-row{display:grid;grid-template-columns:1.2fr .7fr 1.4fr 1.5fr;gap:14px;padding:12px 0;border-bottom:1px solid #1f2937;align-items:center}"
+".storage-mount{font-weight:700;color:#e2e8f0;font-size:13px}"
+".storage-pct{color:#94a3b8;font-size:12px}"
+".storage-size{color:#94a3b8;font-size:12px}"
+".storage-bar{display:flex;gap:3px;align-items:center}"
+".storage-seg{width:14px;height:14px;border-radius:2px;background:#1e293b;flex-shrink:0}"
+".storage-seg.on{background:#38bdf8}"
+".storage-seg.on.warn{background:#f59e0b}"
+".storage-seg.on.bad{background:#ef4444}";
var st2=document.createElement("style");st2.textContent=storageCss;document.head.appendChild(st2);
var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
function fmtN(v,s){return(v===undefined||v===null||isNaN(v))?"--":((Math.round(v*10)/10)+(s||""));}
function mini(l,v){return"<div class=\"stat-mini\"><div class=\"stat-mini-label\">"+l+"</div><div class=\"stat-mini-val\">"+v+"</div></div>";}
function newRenderDetail(){
var s=SERVERS.find(function(x){return x.name===CURRENT;});
if(!s){document.getElementById("detailContent").innerHTML="No data";return;}
if(_builtFor===CURRENT&&document.getElementById("perf-tabs-marker"))return;
_builtFor=CURRENT;
window.CURRENT=CURRENT;
var st=serverStatus(s);
var cpuP=s.cpu?s.cpu.usage_pct.toFixed(1):0;
var ramP=(s.ram&&s.ram.total_mb)?Math.round(100*s.ram.used_mb/s.ram.total_mb):0;
var fu=function(sec){if(!sec)return"--";var d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600);return d+"d "+h+"h";};
var pc=function(p){return p>=95?"bad":p>=90?"warn":"ok";};
var osB=s.os_type==="AIX"?"AIX":(s.os_type==="SunOS"?"Solaris":"RHEL");
var cc=(st==="critical"?"bad":(st==="warning"?"warn":(st==="offline"?"off":"ok")));
var mounts="";
if(s.mounts&&s.mounts.length){
  var rows="";
  s.mounts.forEach(function(m){
    var p=Number(m.use_pct)||0;
    var cls=p>85?"bad":(p>=70?"warn":"");
    var filled=Math.round(p/10);
    var bar="";
    for(var bi=0;bi<10;bi++){bar+='<div class="storage-seg '+(bi<filled?("on "+cls):"")+'"></div>';}
    var totalGB=Number(m.total_gb)||0;
    var usedGB=Number(m.used_gb)||0;
    rows+='<div class="storage-row">'
      +'<div class="storage-mount">'+m.mount+'</div>'
      +'<div class="storage-pct">'+p+'%</div>'
      +'<div class="storage-size">'+usedGB.toFixed(2)+' GB / '+totalGB.toFixed(2)+' GB</div>'
      +'<div class="storage-bar">'+bar+'</div>'
      +'</div>';
  });
  mounts='<div class="storage-table">'
    +'<div class="storage-header">'
    +'<div>Mount Point</div><div>Used %</div><div>Capacity / Total Size</div><div>Visual Storage Bar</div>'
    +'</div>'
    +rows+'</div>';
}
var procs=(s.top_cpu||[]).slice(0,15).map(function(p){return"<tr><td>"+p.pid+"</td><td>"+p.user+"</td><td>"+(p.cpu||0).toFixed(1)+"</td><td>"+(p.mem||0).toFixed(1)+"</td><td>"+p.cmd+"</td></tr>";}).join("");
var h="";
h+="<div style=\"display:flex;align-items:center;gap:18px;margin:0 0 8px;flex-wrap:wrap\">";
h+="<h2 style=\"margin:0;color:#e2e8f0\">"+s.name+" <span class=\"os-badge\">"+osB+"</span></h2>";
h+="<button class=\"ai-btn\" onclick=\"askAIAboutServer(CURRENT)\" id=\"aiAskServerBtn\"><span class=\"ai-icon\">🤖</span><span>Ask AI</span></button>";
h+="</div>";
h+="<div style=\"color:#94a3b8;font-size:12px;margin-bottom:16px\">"+(s.os_version||"")+" | Kernel "+(s.kernel||"")+" | Uptime "+fu(s.uptime_sec)+"</div>";
h+="<div class=\"perf-tabs\" id=\"perf-tabs-marker\">";
h+="<button class=\"perf-tab active\" data-tab=\"overview\" onclick=\"window._setTab('overview')\">Overview</button>";
h+="<button class=\"perf-tab\" data-tab=\"specs\" onclick=\"window._setTab('specs')\">Specs</button>";
h+="<button class=\"perf-tab\" data-tab=\"performance\" onclick=\"window._setTab('performance')\">Performance</button>";
h+="<button class=\"perf-tab\" data-tab=\"storage\" onclick=\"window._setTab('storage')\">Storage</button>";
h+="<button class=\"perf-tab\" data-tab=\"processes\" onclick=\"window._setTab('processes')\">Processes</button>";
h+="<button class=\"perf-tab\" data-tab=\"services\" onclick=\"window._setTab('services')\">Services</button>";
h+="</div>";
h+="<div class=\"perf-pane active\" id=\"pane-overview\">";
h+="<div class=\"card "+cc+"\" style=\"cursor:default\"><h3>CPU</h3><div style=\"font-size:32px;font-weight:800;color:#38bdf8\">"+cpuP+"%</div><div class=\"row\"><span>Load 1/5/15</span><b>"+(s.cpu?s.cpu.load_1+" / "+s.cpu.load_5+" / "+s.cpu.load_15:"--")+"</b></div></div>";
h+="<div class=\"card "+cc+"\" style=\"cursor:default;margin-top:12px\"><h3>RAM</h3><div style=\"font-size:32px;font-weight:800;color:#a78bfa\">"+ramP+"%</div><div class=\"row\"><span>Used</span><b>"+(s.ram?s.ram.used_mb+" / "+s.ram.total_mb+" MB":"--")+"</b></div></div>";
h+="</div>";
h+="<div class=\"perf-pane\" id=\"pane-specs\">";
h+=renderSpecsTab(s);
h+="</div>";

h+="<div class=\"perf-pane\" id=\"pane-performance\">";
h+="<div class=\"time-range\">";
h+="<button class=\"time-btn\" data-r=\"1h\" onclick=\"window._setRange('1h')\">1 Hour</button>";
h+="<button class=\"time-btn\" data-r=\"6h\" onclick=\"window._setRange('6h')\">6 Hours</button>";
h+="<button class=\"time-btn active\" data-r=\"24h\" onclick=\"window._setRange('24h')\">24 Hours</button>";
h+="<button class=\"time-btn\" data-r=\"7d\" onclick=\"window._setRange('7d')\">7 Days</button>";
h+="</div>";
h+="<div style=\"margin:14px 0\"><button class=\"ai-btn\" onclick=\"askAIAboutTrend(window.CURRENT, window.RANGE)\" id=\"aiAskTrendBtn\"><span class=\"ai-icon\">📊</span><span>Analyze Trend</span></button></div>";
h+="<div class=\"chart-card-perf\"><div class=\"chart-head-perf\">CPU Usage</div><div class=\"chart-container\" id=\"chart-cpu\"></div><div class=\"chart-stats\" id=\"stats-cpu\"></div></div>";
h+="<div class=\"chart-card-perf\"><div class=\"chart-head-perf\">RAM Usage</div><div class=\"chart-container\" id=\"chart-ram\"></div><div class=\"chart-stats\" id=\"stats-ram\"></div></div>";
h+="<div class=\"chart-card-perf\"><div class=\"chart-head-perf\">Load Average (1m)</div><div class=\"chart-container\" id=\"chart-load\"></div></div>";
h+="<div class=\"chart-card-perf\"><div class=\"chart-head-perf\">Disk Usage (max mount)</div><div class=\"chart-container\" id=\"chart-disk\"></div></div>";
h+="</div>";
h+="<div class=\"perf-pane\" id=\"pane-storage\"><div class=\"chart-card-perf\"><div class=\"chart-head-perf\">Mount Points</div>"+(mounts||"<div class=\"no-data\">No data</div>")+"</div></div>";
h+="<div class=\"perf-pane\" id=\"pane-services\"><div id=\"services-content\"></div></div>";
h+="<div class=\"perf-pane\" id=\"pane-processes\"><div class=\"chart-card-perf\" style=\"overflow-x:auto\"><div class=\"chart-head-perf\">Top Processes (by CPU)</div><table><thead><tr><th>PID</th><th>User</th><th>CPU%</th><th>MEM%</th><th>Command</th></tr></thead><tbody>"+(procs||"<tr><td colspan=\"5\">No data</td></tr>")+"</tbody></table></div></div>";
document.getElementById("detailContent").innerHTML=h;
RANGE="24h";TAB="overview";
}
function renderSpecsTab(s) {
  var h = '';
  var m = s.machine || {};
  var uptimeDays = s.uptime_sec ? Math.floor(s.uptime_sec / 86400) : 0;
  var ramTotalGb = s.ram && s.ram.total_mb ? Math.round(s.ram.total_mb / 1024) : 0;
  var ramUsedGb = s.ram && s.ram.used_mb ? Math.round(s.ram.used_mb / 1024 * 10) / 10 : 0;

  // ───── HARDWARE ─────
  h += '<div class="spec-group">';
  h += '<div class="spec-group-title"><span class="icon">🖥</span>Hardware</div>';
  h += '<div class="spec-table">';
  h += specRow('Hostname', s.name);
  h += specRow('Machine Model', m.machine_model || s.machine_model || (s.os_type === "AIX" ? "IBM Power System" : "x86_64 Server"));
  h += specRow('CPU Model', m.cpu_model || 'Detecting...');
  h += specRow('CPU Cores', m.cpu_cores || '--');
  h += specRow('Architecture', m.arch || (s.os_type === "AIX" ? "ppc64" : "x86_64"));
  h += specRow('Total RAM', ramTotalGb + ' GB', 'blue');
  h += specRow('RAM Used', ramUsedGb + ' GB (' + (s.ram ? Math.round(100 * s.ram.used_mb / s.ram.total_mb) : 0) + '%)');
  h += specRow('Swap', s.ram ? Math.round(s.ram.swap_total_mb / 1024) + ' GB' : '--');
  h += specRow('Serial Number', m.serial || '--');
  h += '</div></div>';

  // ───── OPERATING SYSTEM ─────
  h += '<div class="spec-group">';
  h += '<div class="spec-group-title"><span class="icon">💿</span>Operating System</div>';
  h += '<div class="spec-table">';
  h += specRow('OS Family', s.os_type || '--');
  h += specRow('OS Version', s.os_version || '--');
  h += specRow('Kernel', s.kernel || '--');
  h += specRow('Uptime', uptimeDays + ' days');
  h += specRow('Boot Time', s.uptime_sec ? new Date((Math.floor(Date.now() / 1000) - s.uptime_sec) * 1000).toLocaleString() : '--');
  h += specRow('Primary IP', (s.machine && s.machine.ip) || s.ip || '--', 'blue');
  h += '</div></div>';

  // ───── NETWORK ─────
  var net = s.network || [];
  if (net.length) {
    h += '<div class="spec-group">';
    h += '<div class="spec-group-title"><span class="icon">🌐</span>Network Interfaces</div>';
    h += '<table class="spec-net-table">';
    h += '<thead><tr><th>Interface</th><th>RX Total</th><th>TX Total</th></tr></thead>';
    h += '<tbody>';
    net.forEach(function(ni){
      h += '<tr>';
      h += '<td>' + ni.iface + '</td>';
      h += '<td>' + formatBytes(ni.rx_kb || 0).replace('/s', '') + '</td>';
      h += '<td>' + formatBytes(ni.tx_kb || 0).replace('/s', '') + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  }

  // ───── USERS ─────
  var users = (s.active_users || (m.active_users)) || [];
  h += '<div class="spec-group">';
  h += '<div class="spec-group-title"><span class="icon">👥</span>Users &amp; SSH Access (' + users.length + ')</div>';
  if (users.length) {
    h += '<div class="spec-user-grid">';
    users.forEach(function(u){
      var nm = typeof u === "string" ? u : (u.name || u.user || "?");
      var isActive = typeof u === "object" ? u.active : true;
      var badgeCls = isActive ? "active" : "sys";
      var badgeText = isActive ? "SSH" : "SHELL";
      var initial = nm.charAt(0).toUpperCase();
      h += '<div class="spec-user-card">';
      h += '<div class="spec-user-avatar">' + initial + '</div>';
      h += '<div class="spec-user-info">';
      h += '<div class="spec-user-name">' + nm + '</div>';
      h += '<div class="spec-user-role">' + (isActive ? "active session" : "system user") + '</div>';
      h += '</div>';
      h += '<span class="spec-user-badge ' + badgeCls + '">' + badgeText + '</span>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="ov-empty">No user data yet<br/><small style="color:#475569">Available after next agent redeploy</small></div>';
  }
  h += '</div>';

  return h;
}

function specRow(key, val, colorClass) {
  var cls = colorClass ? ' ' + colorClass : '';
  var displayVal = (val === undefined || val === null || val === "" || val === "0") ? '<span class="dim">--</span>' : val;
  if (typeof displayVal === "string" && (val === undefined || val === null || val === "")) {
    displayVal = '<span class="dim">--</span>';
  }
  return '<div class="spec-row"><span class="spec-key">' + key + '</span><span class="spec-val' + cls + '">' + displayVal + '</span></div>';
}

if(window.renderDetail)window.renderDetail=newRenderDetail;
if(window.rd)window.rd=newRenderDetail;
window._setTab=function(t){
TAB=t;
document.querySelectorAll(".perf-tab").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-tab")===t);});
document.querySelectorAll(".perf-pane").forEach(function(p){p.classList.remove("active");});
var p=document.getElementById("pane-"+t);if(p)p.classList.add("active");
if(t==="performance")setTimeout(loadPerf,100);if(t==="services")setTimeout(renderServices,50);
};
window._setRange=function(r){
RANGE=r;
window.RANGE=r;
document.querySelectorAll(".time-btn").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-r")===r);});
setTimeout(loadPerf,80);
};
function loadPerf(){
if(TAB!=="performance")return;
if(typeof api!=="function")return;
api("/api/v1/servers/"+encodeURIComponent(CURRENT)+"/history_agg?range="+RANGE)
.then(function(r){var d=r.data;drawCPU(d.points,d.stats.cpu);drawRAM(d.points,d.stats.ram);drawLoad(d.points);drawDisk(d.points);})
.catch(function(e){console.error("perf load",e);});
}
function drawSVG(id,points,key,color,yMax,unit){
var el=document.getElementById(id);if(!el)return;
if(!points||points.length<2){el.innerHTML="<div class=\"no-data\">Not enough data</div>";return;}
var W=el.clientWidth||800,H=200,PL=44,PR=12,PT=10,PB=24;
var w=W-PL-PR,h=H-PT-PB;
var ts=points.map(function(p){return p.ts;});
var minTs=Math.min.apply(null,ts),maxTs=Math.max.apply(null,ts);
var span=(maxTs-minTs)||1;
var svg="<svg width=\""+W+"\" height=\""+H+"\" viewBox=\"0 0 "+W+" "+H+"\" style=\"display:block\">";
var i,y,val;
for(i=0;i<=4;i++){
y=PT+(h*i/4);val=yMax*(1-i/4);
svg+="<line x1=\""+PL+"\" y1=\""+y+"\" x2=\""+(W-PR)+"\" y2=\""+y+"\" stroke=\"#1f2937\" stroke-width=\"1\"/>";
svg+="<text x=\""+(PL-5)+"\" y=\""+(y+3)+"\" fill=\"#64748b\" font-size=\"10\" text-anchor=\"end\">"+val.toFixed(0)+(unit||"")+"</text>";
}
var pts=[];
for(i=0;i<points.length;i++){
var p=points[i];var v=Number(p[key]);if(isNaN(v))continue;
var x=PL+((p.ts-minTs)/span)*w;
var yy=PT+h-(Math.min(Math.max(v,0),yMax)/yMax)*h;
pts.push(x.toFixed(1)+","+yy.toFixed(1));
}
if(pts.length>0){
svg+="<polyline points=\""+pts.join(" ")+"\" fill=\"none\" stroke=\""+color+"\" stroke-width=\"2\" stroke-linejoin=\"round\"/>";
}
var step=Math.max(1,Math.floor(points.length/6));
for(i=0;i<points.length;i+=step){
var x=PL+((points[i].ts-minTs)/span)*w;
var label=new Date(points[i].ts*1000).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
svg+="<text x=\""+x+"\" y=\""+(H-6)+"\" fill=\"#64748b\" font-size=\"10\" text-anchor=\"middle\">"+label+"</text>";
}
svg+="</svg>";
el.innerHTML=svg;
}
function drawCPU(p,s){
drawSVG("chart-cpu",p,"cpu","#38bdf8",100,"%");
var sc=document.getElementById("stats-cpu");
if(sc)sc.innerHTML=mini("Current",fmtN(s.current,"%"))+mini("Average",fmtN(s.avg,"%"))+mini("Min",fmtN(s.min,"%"))+mini("Max",fmtN(s.max,"%"));
}
function drawRAM(p,s){
drawSVG("chart-ram",p,"ram","#a78bfa",100,"%");
var sc=document.getElementById("stats-ram");
if(sc)sc.innerHTML=mini("Current",fmtN(s.current,"%"))+mini("Average",fmtN(s.avg,"%"))+mini("Min",fmtN(s.min,"%"))+mini("Max",fmtN(s.max,"%"));
}
function drawLoad(p){
var yMax=100;
if(p&&p.length){var mx=0;p.forEach(function(x){if(x.load1>mx)mx=x.load1;});yMax=Math.max(mx*1.2,1);}
drawSVG("chart-load",p,"load1","#fbbf24",yMax,"");
}
function drawDisk(p){
drawSVG("chart-disk",p,"disk","#ef4444",100,"%");
}
(function(){
var _oSD=window.showDetail,_oSL=window.showList;
window.showDetail=function(n){_builtFor=null;if(_oSD)_oSD(n);};
window.showList=function(){_builtFor=null;if(_oSL)_oSL();};
})();
setInterval(function(){
var dv=document.getElementById("detailView");
if(TAB==="performance"&&dv&&dv.style.display==="block")loadPerf();
},15000);
console.log("[SNGPL] Performance tab loaded (SVG)");

function renderServices(){
  var el = document.getElementById("services-content");
  if (!el) return;
  var s = SERVERS.find(function(x){ return x.name === CURRENT; });
  if (!s) { el.innerHTML = '<div class="no-data">No server selected</div>'; return; }
  var services = s.services || [];
  if (!services.length) {
    el.innerHTML = '<div class="no-data">No services configured for this server.</div>';
    return;
  }
  var running = 0, degraded = 0, down = 0, unknown = 0;
  services.forEach(function(sv){
    var st = (sv.status || "unknown").toLowerCase();
    if (st === "running") running++;
    else if (st === "degraded") degraded++;
    else if (st === "down") down++;
    else unknown++;
  });
  var h = '';
  h += '<div class="chart-card-perf">';
  h += '<div class="chart-head-perf">Service Status Summary</div>';
  h += '<div style="display:flex;gap:20px;padding:8px 0;font-size:13px">';
  h += '<span><b style="color:#10b981;font-size:16px">●</b> ' + running + ' Running</span>';
  if (degraded) h += '<span><b style="color:#f59e0b;font-size:16px">●</b> ' + degraded + ' Degraded</span>';
  if (down) h += '<span><b style="color:#ef4444;font-size:16px">●</b> ' + down + ' Down</span>';
  if (unknown) h += '<span><b style="color:#64748b;font-size:16px">●</b> ' + unknown + ' Unknown</span>';
  h += '</div>';
  h += '</div>';
  h += '<div class="chart-card-perf" style="margin-top:14px;overflow-x:auto">';
  h += '<div class="chart-head-perf">Monitored Services (' + services.length + ')</div>';
  h += '<table style="width:100%"><thead><tr><th>Service</th><th>Status</th><th>Type</th><th>Check</th><th>Response</th></tr></thead><tbody>';
  services.forEach(function(sv){
    var st = (sv.status || "unknown").toLowerCase();
    var color = st === "running" ? "#10b981" : st === "degraded" ? "#f59e0b" : st === "down" ? "#ef4444" : "#64748b";
    var label = st.toUpperCase();
    h += '<tr>';
    h += '<td style="font-weight:600;color:#e2e8f0">' + (sv.name || '-') + '</td>';
    h += '<td><span style="color:' + color + ';font-weight:700">●</span> <span style="color:' + color + '">' + label + '</span></td>';
    h += '<td style="color:#94a3b8;font-size:11px">' + (sv.type || '-') + '</td>';
    h += '<td style="color:#94a3b8;font-size:11px">' + (sv.check || '-') + '</td>';
    h += '<td style="color:#94a3b8;font-size:11px">' + (sv.response_ms || 0) + ' ms</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  h += '</div>';
  el.innerHTML = h;
}

})();
