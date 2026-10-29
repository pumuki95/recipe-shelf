/* ---------- editing ----------
   Edits are saved to edits.json in the GitHub repo (pumuki95/recipe-shelf) using a
   GitHub key stored only on this device. Without the key, the editor stays locked. */
const REPO = "pumuki95/recipe-shelf", EDITS_PATH = "edits.json";
const AISLE_OPTS = ["Produce","Meat","Dairy","Bakery","Frozen","International","Baking","Pantry","Household"];
let ORIGINAL = {};          // id -> recipe as built from the videos (before edits)
const ghKey = { get(){ try{ return localStorage.getItem("rs-gh-key")||""; }catch(e){ return ""; } },
                set(v){ try{ v ? localStorage.setItem("rs-gh-key", v) : localStorage.removeItem("rs-gh-key"); }catch(e){} } };
function normalizeTags(r){
  r.tags = (r.tags||[]).filter(t=>t!=="Low carb");
  if(r.macros.carbs <= LOW_CARB_MAX) r.tags.push("Low carb");
}
function applyEdits(edits){
  for(const [id, e] of Object.entries((edits&&edits.recipes)||{})){
    const i = RECIPES.findIndex(r=>r.id===id);
    if(i<0) continue;
    if(e.hidden){ RECIPES.splice(i,1); continue; }
    RECIPES[i] = {...RECIPES[i], ...e.recipe, id, src: RECIPES[i].src, edited: e.at};
    normalizeTags(RECIPES[i]);
  }
}
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g,""))));
async function gh(method, body){
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${EDITS_PATH}`+(method==="GET"?`?ref=main&t=${Date.now()}`:""), {
    method, headers:{ "Authorization":"Bearer "+ghKey.get(), "Accept":"application/vnd.github+json", ...(body?{"Content-Type":"application/json"}:{}) },
    body: body?JSON.stringify(body):undefined });
  if(method==="GET" && r.status===404) return {missing:true};
  if(r.status===401) throw new Error("GitHub didn't accept the key. It may have expired; unlock again with a new one.");
  if(r.status===403||r.status===404) throw new Error("This key can't write to the recipe-shelf repository. Check it has Contents: Read and write access.");
  if(r.status===409||r.status===422) throw new Error("Someone saved at the same moment. Try Save again.");
  if(!r.ok) throw new Error("GitHub returned an error ("+r.status+"). Try again in a minute.");
  return r.json();
}
async function saveEdit(id, recipe, opts={}){
  const cur = await gh("GET");
  const data = cur.missing ? {version:1, recipes:{}} : JSON.parse(unb64(cur.content));
  data.recipes = data.recipes||{};
  if(opts.revert) delete data.recipes[id];
  else data.recipes[id] = {at:new Date().toISOString(), ...(opts.hidden?{hidden:true}:{recipe})};
  const title = (recipe&&recipe.title)||id;
  await gh("PUT", {message:(opts.revert?"Revert ":opts.hidden?"Hide ":"Edit ")+title+" (from the site)", content:b64(JSON.stringify(data,null,1)), branch:"main", ...(cur.sha?{sha:cur.sha}:{})});
  try{ localStorage.setItem("rs-edits-cache", JSON.stringify({at:Date.now(), data})); }catch(e){}
  return data;
}

/* Unlock screen: one-time setup per device */
function unlockView(r){
  $("#app").innerHTML = `
    <a class="back" href="#r-${r.id}">← Back to recipe</a>
    <div class="howto">
      <h2>Unlock editing</h2>
      <p>Edits are saved to your GitHub project, so they show up on every device and stay put when new recipes are added. To keep the editor from being used by accident, this device needs your GitHub key once.</p>
      <ol>
        <li>On GitHub, open <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and choose <b>Generate new token</b> (<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">direct link ↗</a>).</li>
        <li>Name it "Recipe Shelf", set an expiration you're happy with, and under <b>Repository access</b> pick <b>Only select repositories → recipe-shelf</b>.</li>
        <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>. Leave everything else as is.</li>
        <li>Generate it, copy it, and paste it below.</li>
      </ol>
      <label for="ghk" class="flabel">GitHub key</label>
      <input id="ghk" class="search" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
      <p class="est" style="margin-top:6px">Stays on this device only. Use "Lock editing" on any recipe to remove it.</p>
      <div class="addrow"><button class="btn" id="unl">Unlock</button><a class="btn ghost" href="#r-${r.id}">Cancel</a></div>
      <p id="unlmsg" class="errmsg" role="alert"></p>
    </div>`;
  $("#unl").onclick = async ()=>{
    const v = $("#ghk").value.trim(); if(!v) return;
    ghKey.set(v); $("#unl").disabled = true; $("#unlmsg").textContent = "Checking…";
    try{ await gh("GET"); toast("Editing unlocked"); editView(r); }
    catch(e){ ghKey.set(""); $("#unlmsg").textContent = e.message; $("#unl").disabled = false; }
  };
}

/* The editor form */
function editView(r){
  if(!ghKey.get()) return unlockView(r);
  const d = JSON.parse(JSON.stringify(r));     // working copy
  let dirty = false;
  const fld = (id,label,val,attrs="") => `<label class="flabel" for="${id}">${label}</label><input id="${id}" class="fin" value="${esc(val??"")}" ${attrs}>`;
  function render(){
    $("#app").innerHTML = `
      <div class="editbar"><span>Editing <b>${esc(r.title)}</b></span><span class="est">Nothing is saved until you press Save.</span></div>
      <div class="eform">
        <section><h3>Basics</h3>
          ${fld("e-title","Title",d.title)}
          <div class="erow3">
            <div>${fld("e-serv","Makes",d.servings,'type="number" min="1" step="1"')}</div>
            <div>${fld("e-unit","Unit (e.g. bowl, cookie)",d.unit)}</div>
            <div>${fld("e-time","Time (minutes)",d.time,'type="number" min="0" step="5"')}</div>
          </div>
        </section>
        <section><h3>Nutrition per ${esc(d.unit)}</h3>
          <div class="erow4">
            <div>${fld("e-cal","Calories",d.macros.cal,'type="number" min="0" step="any"')}</div>
            <div>${fld("e-pro","Protein (g)",d.macros.protein,'type="number" min="0" step="any"')}</div>
            <div>${fld("e-carb","Carbs (g)",d.macros.carbs,'type="number" min="0" step="any"')}</div>
            <div>${fld("e-fat","Fat (g)",d.macros.fat,'type="number" min="0" step="any"')}</div>
          </div>
          <label class="chk"><input type="checkbox" id="e-stated" ${["cal","protein","carbs","fat"].every(k=>d.stated.includes(k))?"checked":""}> These numbers are confirmed (removes the "est." marks)</label>
        </section>
        <section><h3>Tags</h3>
          ${fld("e-tags","Separate with commas",d.tags.filter(t=>t!=="Low carb").join(", "))}
          <p class="est">Useful filter tags: ${FILTERS.flatMap(f=>f[1]).filter(t=>t!=="Low carb").join(", ")}. "Low carb" is added automatically at ${LOW_CARB_MAX} g carbs or less.</p>
        </section>
        <section><h3>Ingredients</h3>
          ${d.groups.map((g,gi)=>`
            <div class="egroup">
              <div class="egh"><input class="fin" data-g="${gi}" data-f="gname" value="${esc(g.name)}" aria-label="Group name"><button class="mini" data-act="delg" data-g="${gi}" ${d.groups.length<2?"disabled":""}>Remove group</button></div>
              <div class="eitems">${g.items.map((it,ii)=>`
                <div class="eitem">
                  <input class="fin q" data-g="${gi}" data-i="${ii}" data-f="q" value="${it.q??""}" placeholder="qty" aria-label="Quantity" inputmode="decimal">
                  <input class="fin u" data-g="${gi}" data-i="${ii}" data-f="u" value="${esc(it.u)}" placeholder="unit" aria-label="Unit">
                  <input class="fin n" data-g="${gi}" data-i="${ii}" data-f="i" value="${esc(it.i)}" placeholder="ingredient" aria-label="Ingredient">
                  <input class="fin nt" data-g="${gi}" data-i="${ii}" data-f="note" value="${esc(it.note||"")}" placeholder="note (optional)" aria-label="Note">
                  <select class="fin a" data-g="${gi}" data-i="${ii}" data-f="a" aria-label="Grocery aisle">${AISLE_OPTS.map(a=>`<option ${a===it.a?"selected":""}>${a}</option>`).join("")}</select>
                  <label class="chk sm"><input type="checkbox" data-g="${gi}" data-i="${ii}" data-f="staple" ${it.staple?"checked":""}> staple</label>
                  <button class="x" data-act="deli" data-g="${gi}" data-i="${ii}" aria-label="Remove ${esc(it.i)}">×</button>
                </div>`).join("")}</div>
              <button class="mini" data-act="addi" data-g="${gi}">+ Add ingredient</button>
            </div>`).join("")}
          <button class="mini" data-act="addg">+ Add ingredient group</button>
          <p class="est">Leave quantity empty for "to taste". "Staple" items start unticked when adding to the grocery list.</p>
        </section>
        <section><h3>Steps</h3>
          ${d.steps.map((s,si)=>`
            <div class="estep">
              <span class="snum">${si+1}</span>
              <div class="sfields">
                <input class="fin" data-s="${si}" data-f="st" value="${esc(s[0])}" placeholder="Short title" aria-label="Step ${si+1} title">
                <textarea class="fin" data-s="${si}" data-f="sx" rows="3" aria-label="Step ${si+1} instructions">${esc(s[1])}</textarea>
              </div>
              <div class="sbtns">
                <button class="mini" data-act="up" data-s="${si}" ${si===0?"disabled":""} aria-label="Move step up">↑</button>
                <button class="mini" data-act="down" data-s="${si}" ${si===d.steps.length-1?"disabled":""} aria-label="Move step down">↓</button>
                <button class="x" data-act="dels" data-s="${si}" aria-label="Remove step ${si+1}">×</button>
              </div>
            </div>`).join("")}
          <button class="mini" data-act="adds">+ Add step</button>
        </section>
        <section><h3>Notes</h3>
          <textarea id="e-notes" class="fin" rows="3">${esc(d.notes||"")}</textarea>
        </section>
        <section class="danger-zone"><h3>More</h3>
          <div class="addrow">
            ${ORIGINAL[r.id] && r.edited ? `<button class="btn ghost" id="e-revert">Undo all my edits to this recipe</button>`:""}
            <button class="btn ghost danger" id="e-hide">Remove recipe from the shelf</button>
            <button class="btn ghost" id="e-lock">Lock editing on this device</button>
          </div>
        </section>
      </div>
      <div class="savebar" id="savebar">
        <div class="sb-in">
          <span id="sbmsg">${dirty?"You have unsaved changes.":"No changes yet."}</span>
          <div class="addrow"><button class="btn ghost" id="e-cancel">Cancel</button><button class="btn" id="e-save" ${dirty?"":"disabled"}>Save…</button></div>
        </div>
      </div>`;
    wire();
  }
  function collect(){
    const v = id => $("#"+id).value;
    d.title = v("e-title").trim() || d.title;
    d.servings = Math.max(1, Math.round(+v("e-serv")||d.servings));
    d.unit = v("e-unit").trim() || d.unit;
    d.time = Math.max(0, Math.round(+v("e-time")||0));
    d.macros = {cal:+v("e-cal")||0, protein:+v("e-pro")||0, carbs:+v("e-carb")||0, fat:+v("e-fat")||0};
    if($("#e-stated").checked) d.stated = ["cal","protein","carbs","fat"];
    else if(["cal","protein","carbs","fat"].every(k=>d.stated.includes(k))) d.stated = (ORIGINAL[r.id]||r).stated.length===4 ? [] : (ORIGINAL[r.id]||r).stated.slice();
    d.tags = v("e-tags").split(",").map(t=>t.trim()).filter(Boolean);
    document.querySelectorAll("[data-f]").forEach(el=>{
      const g = el.dataset.g, i = el.dataset.i, s = el.dataset.s, f = el.dataset.f;
      if(f==="gname") d.groups[g].name = el.value;
      else if(i!==undefined){
        const it = d.groups[g].items[i];
        if(f==="q"){ const t = el.value.trim().replace(",", "."); const fr = t.match(/^(\d+)?\s*(\d+)\/(\d+)$/); it.q = t==="" ? null : fr ? (+(fr[1]||0) + fr[2]/fr[3]) : (isNaN(+t) ? it.q : +t); }
        else if(f==="staple") it.staple = el.checked || undefined;
        else if(f==="note") it.note = el.value.trim() || undefined;
        else it[f] = el.value;
        if(f==="i"||f==="q"||f==="u") delete it.est;
      }
      else if(s!==undefined){ if(f==="st") d.steps[s][0] = el.value; else d.steps[s][1] = el.value; }
    });
    d.notes = v("e-notes");
  }
  function changed(){ dirty = true; window.__editDirty = true; const b=$("#e-save"); if(b) b.disabled=false; const m=$("#sbmsg"); if(m) m.textContent="You have unsaved changes."; }
  function wire(){
    document.querySelectorAll(".eform input, .eform textarea, .eform select").forEach(el=>el.addEventListener("input", changed));
    document.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>{
      collect(); const g=+b.dataset.g, i=+b.dataset.i, s=+b.dataset.s;
      switch(b.dataset.act){
        case "addi": d.groups[g].items.push({q:null,u:"",i:"",a:"Pantry"}); break;
        case "deli": d.groups[g].items.splice(i,1); break;
        case "addg": d.groups.push({name:"New group", items:[{q:null,u:"",i:"",a:"Pantry"}]}); break;
        case "delg": d.groups.splice(g,1); break;
        case "adds": d.steps.push(["",""]); break;
        case "dels": d.steps.splice(s,1); break;
        case "up": [d.steps[s-1],d.steps[s]]=[d.steps[s],d.steps[s-1]]; break;
        case "down": [d.steps[s+1],d.steps[s]]=[d.steps[s],d.steps[s+1]]; break;
      }
      dirty = true; window.__editDirty = true; const y=scrollY; render(); scrollTo(0,y);
    });
    $("#e-cancel").onclick = ()=>{
      if(!dirty) return void (location.hash = "r-"+r.id);
      confirmBar("Discard your unsaved changes?", "Discard", ()=>{ dirty = false; window.__editDirty = false; location.hash = "r-"+r.id; });
    };
    $("#e-save").onclick = ()=>{
      collect();
      d.groups.forEach(g=>g.items = g.items.filter(it=>it.i.trim()));
      d.steps = d.steps.filter(s=>(s[0]+s[1]).trim());
      confirmBar(`Save changes to "${d.title}"? They'll be live on the site within a couple of minutes.`, "Yes, save", async ()=>{
        await persist(()=>saveEdit(r.id, stripRecipe(d)), "Saved");
      });
    };
    $("#e-hide").onclick = ()=> confirmBar(`Remove "${r.title}" from your shelf? You can ask Claude to bring it back later.`, "Remove recipe", async ()=>{
      await persist(()=>saveEdit(r.id, r, {hidden:true}), "Recipe removed", "#");
    }, true);
    const rv = $("#e-revert"); if(rv) rv.onclick = ()=> confirmBar("Undo all your edits and go back to the version from the video?", "Undo my edits", async ()=>{
      await persist(()=>saveEdit(r.id, r, {revert:true}), "Edits undone");
    }, true);
    $("#e-lock").onclick = ()=>{ ghKey.set(""); toast("Editing locked on this device"); location.hash = "r-"+r.id; };
  }
  async function persist(fn, okMsg, goTo){
    $("#savebar .sb-in").innerHTML = `<span id="sbmsg">Saving…</span>`; const m = $("#sbmsg");
    try{
      const data = await fn();
      dirty = false; window.__editDirty = false;
      await reloadRecipes(data);
      toast(okMsg); const target = goTo || ("#r-"+r.id); if(location.hash===target || (target==="#" && !location.hash)) route(); else location.hash = target;
    }catch(e){ const y=scrollY; render(); scrollTo(0,y); $("#sbmsg").innerHTML = `<span class="errmsg">Not saved. ${esc(e.message)}</span>`; }
  }
  function confirmBar(text, yes, onYes, danger){
    const sb = $("#savebar .sb-in");
    sb.innerHTML = `<span><b>${esc(text)}</b></span><div class="addrow"><button class="btn ghost" id="cb-no">Go back</button><button class="btn ${danger?"dangerfill":""}" id="cb-yes">${esc(yes)}</button></div>`;
    $("#cb-no").onclick = ()=>{ const y=scrollY; render(); scrollTo(0,y); };
    $("#cb-yes").onclick = ()=>{ $("#cb-yes").disabled = true; onYes(); };
    $("#cb-yes").focus();
  }
  window.__editDirty = false;
  render();
}
function stripRecipe(d){
  const {id, src, edited, ...rest} = d;
  rest.tags = rest.tags.filter(t=>t!=="Low carb");
  return rest;
}
async function reloadRecipes(edits){
  const data = await fetch("recipes.json",{cache:"no-cache"}).then(r=>r.json());
  RECIPES = data.recipes; ORIGINAL = Object.fromEntries(data.recipes.map(r=>[r.id, JSON.parse(JSON.stringify(r))]));
  RECIPES.forEach(normalizeTags);
  applyEdits(edits);
  $("#tally").textContent = RECIPES.length + " recipes · " + data.sources.length + " videos";
}
async function loadEdits(){
  let remote = null;
  try{ const r = await fetch(EDITS_PATH, {cache:"no-cache"}); if(r.ok) remote = await r.json(); }catch(e){}
  // A just-saved edit can take a minute or two to reach the live site; prefer the newer local copy meanwhile.
  try{
    const c = JSON.parse(localStorage.getItem("rs-edits-cache")||"null");
    if(c && Date.now()-c.at < 3*60*1000) remote = c.data;
  }catch(e){}
  return remote;
}
