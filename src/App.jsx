import React, { useEffect, useMemo, useState } from "react";
import {
  Heart, CalendarDays, Sparkles, BookHeart, Leaf, ShieldCheck,
  Plus, ChevronLeft, ChevronRight, Wind, Smile, Trash2, LogOut,
  Cloud, CloudOff, LockKeyhole, UserRound, CheckCircle2, CircleHelp, Play, Pause, RotateCcw, Timer, Check
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabase.js";

const LOCAL_KEY = "vedabloom-local-v1";
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const EMPTY = { periods: [], checkins: [], journal: [], supportPreference: "checkin" };
const moods = [
  { id:"okay", label:"Okay", emoji:"🌿" },
  { id:"overwhelmed", label:"Overwhelmed", emoji:"🌧️" },
  { id:"anxious", label:"Anxious", emoji:"🫧" },
  { id:"low", label:"A little low", emoji:"🌙" },
  { id:"tired", label:"Exhausted", emoji:"☁️" }
];
const exercises = {
  calm: { title:"Let's make a little room to breathe.", body:"Relax your shoulders if that feels comfortable. Notice your feet on the ground. Breathe normally, and let your next few exhales be gentle. You can stop whenever you want." },
  thoughts: { title:"Let's untangle one thought at a time.", body:"Try writing: What happened? What am I telling myself it means? What else could be true? You don't need to force a positive answer—just make space for another possibility." },
  distract: { title:"A tiny reset counts.", body:"Pick one small thing: play a favourite song, watch something funny, stretch gently, make a warm drink, or look outside for a minute. No need to fix everything right now." }
};
const breathingPresets = {
  gentle: { name:"Gentle reset", subtitle:"A relaxed, no-pressure rhythm", duration:60, phases:[{label:"Breathe in gently",seconds:3},{label:"Breathe out slowly",seconds:4}], note:"Let your breath stay natural and comfortable. No need to take deep breaths." },
  unwind: { name:"Longer exhale", subtitle:"A soft way to slow things down", duration:90, phases:[{label:"Breathe in",seconds:4},{label:"Breathe out",seconds:6}], note:"Try a comfortable inhale and a slightly longer exhale. Shorten the count if needed." },
  box: { name:"Box breathing", subtitle:"An even, steady rhythm", duration:60, phases:[{label:"Breathe in",seconds:4},{label:"Pause gently",seconds:4},{label:"Breathe out",seconds:4},{label:"Pause gently",seconds:4}], note:"Optional holds only. Skip either pause and breathe normally if holding feels uncomfortable." }
};
const supportOptions = [
  ["checkin","A gentle check-in later"],
  ["comfort","A little extra comfort"],
  ["space","Some space, please"],
  ["normal","Talk to me normally"]
];
function freshData() { return structuredClone(EMPTY); }
function readLocal() {
  try { return { ...freshData(), ...JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") }; }
  catch { return freshData(); }
}
function fmt(date) {
  if (!date) return "Not recorded";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function id() { return crypto.randomUUID(); }

export default function App() {
  const [tab,setTab] = useState("home");
  const [data,setData] = useState(readLocal);
  const [user,setUser] = useState(null);
  const [authReady,setAuthReady] = useState(!hasSupabaseConfig);
  const [authMode,setAuthMode] = useState("signin");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authMessage,setAuthMessage] = useState("");
  const [authBusy,setAuthBusy] = useState(false);
  const [cloudEnabled,setCloudEnabled] = useState(false);
  const [syncBusy,setSyncBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [periodDate,setPeriodDate] = useState(todayISO());
  const [flow,setFlow] = useState("moderate");
  const [symptoms,setSymptoms] = useState([]);
  const [mood,setMood] = useState("okay");
  const [exercise,setExercise] = useState("calm");
  const [journalText,setJournalText] = useState("");
  const [month,setMonth] = useState(new Date());
  const [partnerEmail,setPartnerEmail] = useState("");
  const [partnerEnabled,setPartnerEnabled] = useState(false);
  const [partnerStatus,setPartnerStatus] = useState("");
  const [partnerNotifications,setPartnerNotifications] = useState([]);
  const [breathingType,setBreathingType] = useState("gentle");
  const [breathingRunning,setBreathingRunning] = useState(false);
  const [breathingElapsed,setBreathingElapsed] = useState(0);
  const [breathingFinished,setBreathingFinished] = useState(false);

  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  },[data]);

  useEffect(() => {
    if (!breathingRunning) return;
    const timer = window.setInterval(() => {
      setBreathingElapsed(prev => {
        const next = prev + 1;
        if (next >= breathingPresets[breathingType].duration) {
          setBreathingRunning(false);
          setBreathingFinished(true);
          return breathingPresets[breathingType].duration;
        }
        return next;
      });
    },1000);
    return () => window.clearInterval(timer);
  },[breathingRunning,breathingType]);

  useEffect(() => {
    if (tab !== "calm") setBreathingRunning(false);
  },[tab]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let alive = true;
    supabase.auth.getSession().then(({data:{session}}) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event,session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => { alive=false; listener.subscription.unsubscribe(); };
  },[]);

  useEffect(() => {
    if (!user || !cloudEnabled) return;
    loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id,cloudEnabled]);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase.from("partner_sharing_settings").select("period_notifications_enabled").eq("owner_id",user.id).maybeSingle().then(({data:row})=>setPartnerEnabled(Boolean(row?.period_notifications_enabled)));
  },[user?.id]);

  const starts = useMemo(()=>[...new Set(data.periods.map(p=>p.start))].sort(),[data.periods]);
  const lastStart = starts.at(-1);
  const interval = starts.length>1
    ? Math.round((new Date(`${starts.at(-1)}T12:00:00`)-new Date(`${starts.at(-2)}T12:00:00`))/86400000)
    : null;
  const calendarCells = useMemo(()=>{
    const y=month.getFullYear(),m=month.getMonth(),offset=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate();
    return [...Array(offset).fill(null),...Array.from({length:count},(_,i)=>i+1)];
  },[month]);

  async function signInOrUp(e) {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode==="signup") {
        const {error}=await supabase.auth.signUp({email,password});
        if (error) throw error;
        setAuthMessage("Account request sent. Check your email to confirm if email confirmation is enabled.");
      } else {
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if (error) throw error;
        setAuthMessage("Signed in.");
      }
    } catch(err) { setAuthMessage(err.message || "Couldn't authenticate. Please try again."); }
    finally { setAuthBusy(false); }
  }
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setCloudEnabled(false); setNotice("Signed out. Your local copy remains on this device.");
  }

  function mergeCloud(rows) {
    // Merge by entry ID so loading cloud data never silently erases local-only entries.
    setData((local) => {
      const next = {
        ...freshData(),
        periods: [...local.periods],
        checkins: [...local.checkins],
        journal: [...local.journal],
        supportPreference: local.supportPreference || "checkin",
      };
      const addUnique = (target, payload) => {
        if (!payload?.id) return;
        if (!target.some((item) => item.id === payload.id)) target.push(payload);
      };
      for (const row of rows || []) {
        const payload = row.payload || {};
        if (row.kind === "period") addUnique(next.periods, payload);
        if (row.kind === "checkin") addUnique(next.checkins, payload);
        if (row.kind === "journal") addUnique(next.journal, payload);
        if (row.kind === "settings") next.supportPreference = payload.supportPreference || next.supportPreference;
      }
      return next;
    });
  }

  async function loadCloudData() {
    if (!supabase || !user) {
      setNotice("Sign in first to load cloud data.");
      return;
    }
    setSyncBusy(true);
    try {
      const { data: rows, error } = await supabase
        .from("wellness_entries")
        .select("id,kind,payload,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      mergeCloud(rows);
      setNotice("Cloud data loaded and merged with this device's entries.");
    } catch (err) {
      setNotice(`Cloud sync couldn't load: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function syncToCloud(nextData = data, force = false) {
    if (!supabase || !user || (!cloudEnabled && !force)) {
      setNotice("Cloud sync is off. Your information remains on this device.");
      return;
    }
    setSyncBusy(true);
    try {
      const entries = [
        ...nextData.periods.map((p) => ({ user_id: user.id, kind: "period", entry_key: p.id, payload: p })),
        ...nextData.checkins.map((p) => ({ user_id: user.id, kind: "checkin", entry_key: p.id, payload: p })),
        ...nextData.journal.map((p) => ({ user_id: user.id, kind: "journal", entry_key: p.id, payload: p })),
        { user_id: user.id, kind: "settings", entry_key: "preferences", payload: { supportPreference: nextData.supportPreference } },
      ];

      // Upsert avoids deleting all existing cloud rows before attempting a replacement.
      // The schema must have a unique constraint on (user_id, kind, entry_key).
      const { error } = await supabase
        .from("wellness_entries")
        .upsert(entries, { onConflict: "user_id,kind,entry_key" });
      if (error) throw error;
      setNotice("Your selected data was synced to your private account.");
    } catch (err) {
      setNotice(`Sync failed: ${err.message}`);
    } finally {
      setSyncBusy(false);
    }
  }
  function updateData(mutator) {
    setData(prev=>{
      const next=mutator(prev);
      if (cloudEnabled && user) queueMicrotask(()=>syncToCloud(next));
      return next;
    });
  }
  async function sendPartnerNotification(date) {
    if (!supabase || !user || !partnerEnabled) return;
    try {
      const {error}=await supabase.from("partner_notifications").insert({owner_id:user.id,kind:"period_logged",event_date:date});
      if (error) throw error;
    } catch(err) { setNotice(`Period saved, but partner notification failed: ${err.message}`); }
  }
  function addPeriod() {
    if (!periodDate) return;
    if (data.periods.some(p=>p.start===periodDate)) { setNotice("That date is already recorded."); return; }
    updateData(prev=>({...prev,periods:[...prev.periods,{id:id(),start:periodDate,flow,symptoms,createdAt:new Date().toISOString()}]}));
    if (partnerEnabled) sendPartnerNotification(periodDate);
    setSymptoms([]); setNotice(cloudEnabled?"Period entry saved. Syncing…":"Period entry saved on this device.");
  }
  async function connectPartner(e) {
    e.preventDefault();
    if (!supabase || !user || !partnerEmail.trim()) return;
    setPartnerStatus("Connecting…");
    try {
      const {error}=await supabase.rpc("connect_partner_by_email",{partner_email:partnerEmail.trim().toLowerCase()});
      if (error) throw error;
      setPartnerStatus("Partner account connected. Notifications are still off until you opt in below.");
    } catch(err) { setPartnerStatus(err.message || "Couldn't connect this account."); }
  }
  async function togglePartnerNotifications(enabled) {
    if (!supabase || !user) { setPartnerStatus("Sign in first."); return; }
    if (enabled && !window.confirm("Opt in to sending your partner a discreet in-app notification whenever you save a period start? The notification will not include symptoms, flow, journal entries, or mood data. You can turn this off anytime.")) return;
    try {
      const {error}=await supabase.from("partner_sharing_settings").upsert({owner_id:user.id,period_notifications_enabled:enabled},{onConflict:"owner_id"});
      if (error) throw error;
      setPartnerEnabled(enabled); setPartnerStatus(enabled?"Period notifications enabled. You can revoke consent anytime.":"Period notifications disabled.");
    } catch(err) { setPartnerStatus(err.message || "Couldn't update sharing settings."); }
  }
  async function loadPartnerNotifications() {
    if (!supabase || !user) return;
    const {data,error}=await supabase.from("partner_notifications").select("id,message,event_date,created_at,read_at").order("created_at",{ascending:false}).limit(20);
    if (error) { setPartnerStatus(error.message); return; }
    setPartnerNotifications(data || []);
  }
  async function markNotificationRead(notificationId) {
    const {error}=await supabase.from("partner_notifications").update({read_at:new Date().toISOString()}).eq("id",notificationId);
    if (!error) setPartnerNotifications(prev=>prev.map(n=>n.id===notificationId?{...n,read_at:new Date().toISOString()}:n));
  }
  function addCheckin() {
    updateData(prev=>({...prev,checkins:[{id:id(),date:todayISO(),mood,exercise,createdAt:new Date().toISOString()},...prev.checkins]}));
    setNotice("Check-in saved."); setTab("home");
  }
  function addJournal() {
    if (!journalText.trim()) return;
    updateData(prev=>({...prev,journal:[{id:id(),date:todayISO(),text:journalText.trim()},...prev.journal]}));
    setJournalText(""); setNotice("Journal entry saved.");
  }
  async function toggleCloud(checked) {
    if (checked && !user) { setNotice("Sign in first, then choose to enable cloud sync."); setTab("account"); return; }
    if (checked) {
      const okay=window.confirm("Enable cloud sync for this account? Your current cycle entries, check-ins, journal entries, and support preference will be uploaded to your authenticated account. Continue only if this is your own account and you want this data in the cloud.");
      if (!okay) return;
      // Pass force=true because React state updates are asynchronous.
      await syncToCloud(data, true);
      setCloudEnabled(true);
    } else {
      setCloudEnabled(false);
      setNotice("Cloud sync turned off. Previously synced copies remain in your account until you delete them.");
    }
  }
  async function deleteAll() {
    if (!window.confirm("Delete all local Bloom data? This cannot be undone.")) return;
    setData(freshData()); localStorage.removeItem(LOCAL_KEY);
    if (user && cloudEnabled && window.confirm("Also delete all cloud entries for your signed-in account?")) {
      const {error}=await supabase.from("wellness_entries").delete().eq("user_id",user.id);
      if (error) setNotice(`Local data deleted. Cloud deletion failed: ${error.message}`);
      else setNotice("Local and cloud entries deleted.");
    } else setNotice("Local data deleted.");
  }

  return <div className="shell">
    <header className="topbar">
      <button className="brand" onClick={()=>setTab("home")}><span className="brand-mark"><Heart size={19} fill="currentColor"/></span><span><strong>VedaBloom</strong><small>a little space for you</small></span></button>
      <button className="icon-button" aria-label="Privacy and account" onClick={()=>setTab("account")}><ShieldCheck size={20}/></button>
    </header>
    {notice && <button className="notice" onClick={()=>setNotice("")}>{notice}<span>×</span></button>}
    {!hasSupabaseConfig && <div className="setup-banner"><CircleHelp size={18}/><div><strong>Local demo mode</strong><span>Add your Supabase URL and public anon/publishable key in <code>.env.local</code> to enable accounts and optional cloud sync. Never use a service-role key in the frontend.</span></div></div>}

    <main>
      {tab==="home" && <section>
        <div className="hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> YOUR GENTLE CORNER</span><h1>Hey, take today<br/><em>one breath at a time.</em></h1><p>You don't have to figure everything out all at once.</p><button className="primary" onClick={()=>setTab("checkin")}>Check in with yourself <ChevronRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><span>☼</span><b>✿</b><i>❧</i></div></div>
        <div className="heading"><div><span className="eyebrow">YOUR SPACE</span><h2>What feels right today?</h2></div></div>
        <div className="features">
          <button className="feature pink" onClick={()=>setTab("cycle")}><span><CalendarDays/></span><strong>Cycle calendar</strong><small>Log dates and notice patterns</small><ChevronRight/></button>
          <button className="feature lilac" onClick={()=>setTab("calm")}><span><Wind/></span><strong>Find a little calm</strong><small>Gentle tools for difficult moments</small><ChevronRight/></button>
          <button className="feature sage" onClick={()=>setTab("journal")}><span><BookHeart/></span><strong>Private journal</strong><small>Write without needing to explain</small><ChevronRight/></button>
          <button className="feature peach" onClick={()=>setTab("support")}><span><Heart/></span><strong>My support wishes</strong><small>Choose what helps you feel supported</small><ChevronRight/></button>
        </div>
        <div className="gentle"><Leaf size={19}/><p><strong>A gentle reminder</strong><br/>Your feelings are real, whatever day of your cycle it is. You deserve care without having to explain everything.</p></div>
        <div className="heading"><div><span className="eyebrow">YOUR NOTES</span><h2>Recently recorded</h2></div></div>
        <div className="recent">
          {data.periods.length===0&&data.checkins.length===0?<p className="muted">Nothing here yet. Add only what you want to remember.</p>:<>
            {data.periods.slice().sort((a,b)=>b.start.localeCompare(a.start)).slice(0,2).map(p=><div className="recent-row" key={p.id}><span className="recent-icon">♡</span><div><strong>Period start recorded</strong><small>{fmt(p.start)} · {p.flow} flow</small></div></div>)}
            {data.checkins.slice(0,2).map(c=><div className="recent-row" key={c.id}><span className="recent-icon lilac-icon">☁</span><div><strong>Wellbeing check-in</strong><small>{fmt(c.date)} · {moods.find(m=>m.id===c.mood)?.label}</small></div></div>)}
          </>}
        </div>
      </section>}

      {tab==="cycle" && <section className="page">
        <Back onClick={()=>setTab("home")}/><span className="eyebrow">CYCLE CALENDAR</span><h1>Your cycle, <em>your pace.</em></h1><p className="intro">Record what you know. Predictions are estimates, and it's okay if your cycle varies.</p>
        <div className="card">
          <div className="cal-title"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft/></button><h3>{month.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</h3><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight/></button></div>
          <div className="calendar">{["S","M","T","W","T","F","S"].map((d,i)=><span className="weekday" key={`${d}${i}`}>{d}</span>)}{calendarCells.map((day,i)=>{const iso=day?`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;const marked=iso&&starts.includes(iso);return <span key={i} className={`day ${!day?"blank":""} ${marked?"marked":""}`}>{day||""}{marked&&<i/>}</span>})}</div>
          <p className="tiny muted">Only dates you enter are shown. No predictions are generated in this MVP.</p>
        </div>
        <div className="card"><h2><Plus size={19}/> Log a period start</h2><label>Start date<input type="date" value={periodDate} max={todayISO()} onChange={e=>setPeriodDate(e.target.value)}/></label><label>Flow (optional)<select value={flow} onChange={e=>setFlow(e.target.value)}><option value="light">Light</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option><option value="spotting">Spotting / unsure</option></select></label><fieldset><legend>Symptoms (optional)</legend><div className="chips">{["Cramps","Headache","Tired","Bloating","Feeling okay"].map(s=><button type="button" key={s} className={symptoms.includes(s)?"chosen":""} onClick={()=>setSymptoms(prev=>prev.includes(s)?prev.filter(x=>x!==s):[...prev,s])}>{s}</button>)}</div></fieldset><button className="primary full" onClick={addPeriod}>Save period entry <ShieldCheck size={17}/></button><p className="privacy-hint"><ShieldCheck size={14}/> Local by default. Cloud sync is opt-in.</p></div>
        <div className="stats"><div><small>Last recorded start</small><strong>{lastStart?fmt(lastStart):"Not recorded"}</strong></div><div><small>Interval between latest starts</small><strong>{interval?`${interval} days`:"Need 2 dates"}</strong><small>Not a diagnosis.</small></div></div>
        <div className="info"><strong>About cycle tracking</strong><p>Cycle length is counted from the first day of one period to the first day of the next. An unusual bleeding episode may be spotting rather than a period. This tool does not predict ovulation or prevent pregnancy.</p></div>
      </section>}

      {tab==="checkin" && <section className="page"><Back onClick={()=>setTab("home")}/><span className="eyebrow">A MOMENT FOR YOU</span><h1>How are you <em>really feeling?</em></h1><p className="intro">No right answers. Choose what feels closest, or skip this whenever you want.</p><div className="moods">{moods.map(m=><button key={m.id} className={mood===m.id?"active":""} onClick={()=>setMood(m.id)}><span>{m.emoji}</span><strong>{m.label}</strong></button>)}</div><div className="card"><h2>What would help right now?</h2><div className="choices">{[["calm","Help me calm down"],["thoughts","Help me untangle my thoughts"],["distract","Give me a gentle distraction"]].map(([k,v])=><button key={k} className={exercise===k?"chosen":""} onClick={()=>setExercise(k)}>{v}{exercise===k&&" ✓"}</button>)}</div><div className="exercise"><span><Wind/></span><h3>{exercises[exercise].title}</h3><p>{exercises[exercise].body}</p></div><button className="primary full" onClick={addCheckin}>Save my check-in</button></div></section>}

      {tab==="calm" && <section className="page calm-page"><Back onClick={()=>setTab("home")}/><span className="eyebrow"><Wind size={14}/> YOUR BREATHING STUDIO</span><h1>Come back to <em>yourself.</em></h1><p className="intro">A small pause, just for you. Pick a rhythm that feels comfortable and follow the circle. You can stop whenever you want.</p>
        <div className="breathing-options">{Object.entries(breathingPresets).map(([key,preset])=><button key={key} className={`breathing-option ${breathingType===key?"selected":""}`} onClick={()=>{setBreathingType(key);setBreathingElapsed(0);setBreathingFinished(false);setBreathingRunning(false)}}><span className="breath-option-icon"><Wind size={18}/></span><strong>{preset.name}</strong><small>{preset.subtitle}</small><span className="breath-duration"><Timer size={13}/>{Math.ceil(preset.duration/60)} min</span></button>)}</div>
        <div className={`breathing-session ${breathingRunning?"is-running":""} ${breathingFinished?"is-finished":""}`}>
          <div className="session-top"><span><Sparkles size={14}/> GUIDED SESSION</span><span>{Math.ceil(breathingPresets[breathingType].duration/60)} MIN</span></div>
          <div className="breathing-orb-wrap"><div className={`breathing-orb ${breathingRunning?"orb-active":""} ${breathingType==="box"?"orb-box":""}`} style={{animationDuration:`${breathingPresets[breathingType].phases.reduce((sum,phase)=>sum+phase.seconds,0)}s`}}><div className="breathing-orb-inner"><Wind size={25}/><strong>{breathingFinished?"Lovely work":breathingRunning?currentBreathPhase(breathingPresets[breathingType],breathingElapsed).label:"Ready when you are"}</strong><small>{breathingFinished?"You made a little space for yourself.":breathingRunning?`${currentBreathRemaining(breathingPresets[breathingType],breathingElapsed)} seconds in this step`:"Relax your jaw and shoulders"}</small></div></div></div>
          <div className="session-progress"><div><span>TIME</span><strong>{String(Math.floor(breathingElapsed/60)).padStart(2,"0")}:{String(breathingElapsed%60).padStart(2,"0")}</strong></div><div className="progress-track"><span style={{width:`${Math.min(100,breathingElapsed/breathingPresets[breathingType].duration*100)}%`}}/></div><div><span>GOAL</span><strong>{String(Math.floor(breathingPresets[breathingType].duration/60)).padStart(2,"0")}:{String(breathingPresets[breathingType].duration%60).padStart(2,"0")}</strong></div></div>
          <p className="breathing-note">{breathingFinished?"You don't have to feel different for this moment to count.":breathingPresets[breathingType].note}</p>
          <div className="session-controls">{!breathingFinished?<button className="primary" onClick={()=>setBreathingRunning(v=>!v)}>{breathingRunning?<><Pause size={17}/> Pause session</>:<><Play size={17} fill="currentColor"/> {breathingElapsed>0?"Continue breathing":"Begin breathing"}</>}</button>:<button className="primary" onClick={()=>{setBreathingElapsed(0);setBreathingFinished(false);setBreathingRunning(false)}}><Check size={17}/> Start again</button>}<button className="reset-button" aria-label="Reset breathing session" onClick={()=>{setBreathingElapsed(0);setBreathingFinished(false);setBreathingRunning(false)}}><RotateCcw size={16}/> Reset</button></div>
        </div>
        <div className="breath-safety"><ShieldCheck size={19}/><p><strong>Comfort first</strong><br/>Breathe normally if you feel dizzy, breathless, or uncomfortable. Skip pauses and stop at any time. This is a relaxation tool, not medical treatment.</p></div>
        <div className="heading calm-heading"><div><span className="eyebrow">MORE GENTLE TOOLS</span><h2>What else might help?</h2></div></div>
        <div className="stack">{Object.entries(exercises).map(([k,v],i)=><article className="calm-card" key={k}><span className="num">0{i+1}</span><h2>{v.title}</h2><p>{v.body}</p><button className="text-button" onClick={()=>{setExercise(k);setTab("checkin")}}>Try this exercise <ChevronRight size={16}/></button></article>)}</div>
        <p className="tiny muted">These are general self-care tools, not mental-health treatment. If distress feels intense or persistent, consider reaching out to someone trusted or a qualified professional.</p></section>}

      {tab==="journal" && <section className="page"><Back onClick={()=>setTab("home")}/><span className="eyebrow">PRIVATE JOURNAL</span><h1>Put it into <em>words.</em></h1><p className="intro">This space is for you. Write as much or as little as you want.</p><div className="card"><label>Your note<textarea rows="6" value={journalText} onChange={e=>setJournalText(e.target.value)} placeholder="Today, I'm feeling…"/></label><button className="primary full" onClick={addJournal}>Save private note <BookHeart size={17}/></button></div>{data.journal.map(entry=><article className="journal-entry" key={entry.id}><small>{fmt(entry.date)}</small><p>{entry.text}</p></article>)}</section>}

      {tab==="support" && <section className="page"><Back onClick={()=>setTab("home")}/><span className="eyebrow">MY SUPPORT WISHES</span><h1>Care, <em>my way.</em></h1><p className="intro">Choose what kind of support you'd like someone to know about. This preference stays private unless you choose to share it.</p><div className="card"><h2>When I'm having a hard day…</h2><div className="choices">{supportOptions.map(([k,v])=><button key={k} className={data.supportPreference===k?"chosen":""} onClick={()=>updateData(prev=>({...prev,supportPreference:k}))}>{v}{data.supportPreference===k&&" ✓"}</button>)}</div><p className="privacy-hint"><ShieldCheck size={14}/> Not shared with anyone automatically.</p></div><div className="info"><strong>Partner notifications</strong><p>Set up a partner connection in Account & Privacy. Only period-start notifications can be shared; journal entries, symptoms, flow, and mood check-ins stay private.</p><button className="secondary full" onClick={()=>setTab("account")}>Set up partner sharing</button></div></section>}

      {tab==="account" && <section className="page"><Back onClick={()=>setTab("home")}/><span className="eyebrow">ACCOUNT & PRIVACY</span><h1>Your body. <em>Your data.</em></h1>
        <div className="card privacy-card"><ShieldCheck size={28}/><h2>Private by default</h2><p>Data stays in this browser unless you sign in and deliberately enable cloud sync. Your data is not shared with JD or another person by this app.</p></div>
        {!hasSupabaseConfig ? <div className="info"><strong>Cloud setup needed</strong><p>Create a Supabase project, run <code>supabase/schema.sql</code> in its SQL editor, and set the environment variables in <code>.env.local</code>. Restart the dev server afterward.</p></div> : <>
          {!authReady ? <p className="muted">Checking account…</p> : user ? <div className="card"><div className="account-line"><UserRound/><div><strong>Signed in</strong><small>{user.email}</small></div></div><div className="cloud-row"><div><strong>Optional cloud sync</strong><small>Uploads cycle entries, check-ins, journal entries and support preference to this account.</small></div><input type="checkbox" checked={cloudEnabled} onChange={e=>toggleCloud(e.target.checked)} aria-label="Enable cloud sync"/></div><p className="privacy-hint"><Cloud size={14}/>{cloudEnabled?"Cloud sync enabled for this session.":"Cloud sync is off."}</p><button className="secondary full" onClick={loadCloudData} disabled={!cloudEnabled||syncBusy}>{syncBusy?"Working…":"Load cloud data"}</button><button className="secondary full" onClick={()=>syncToCloud()} disabled={!cloudEnabled||syncBusy}>{syncBusy?"Working…":"Sync current local data"}</button><div className="partner-panel"><h2><Heart size={18}/> Partner notifications</h2><p className="tiny muted">Both people need their own VedaBloom account. The person who wants to share period notifications should connect their partner's email and opt in. The partner only receives discreet alerts, not health history.</p><form onSubmit={connectPartner}><label>Partner's account email<input type="email" value={partnerEmail} onChange={e=>setPartnerEmail(e.target.value)} placeholder="partner@example.com" required/></label><button className="secondary full">Connect partner account</button></form><div className="cloud-row"><div><strong>Notify partner when I log a period</strong><small>Only a discreet in-app alert. No symptoms, flow, mood or journal data.</small></div><input type="checkbox" checked={partnerEnabled} onChange={e=>togglePartnerNotifications(e.target.checked)} aria-label="Enable partner period notifications"/></div>{partnerStatus&&<p className="auth-message">{partnerStatus}</p>}<button className="secondary full" onClick={loadPartnerNotifications}>Load my partner notifications</button>{partnerNotifications.length===0?<p className="tiny muted">No partner notifications yet.</p>:partnerNotifications.map(n=><div className="notification-row" key={n.id}><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString()}</small>{!n.read_at&&<button className="text-button" onClick={()=>markNotificationRead(n.id)}>Mark read</button>}</div>)}</div><button className="secondary full" onClick={signOut}><LogOut size={16}/> Sign out</button></div> : <form className="card auth-form" onSubmit={signInOrUp}><div className="auth-switch"><button type="button" className={authMode==="signin"?"selected":""} onClick={()=>setAuthMode("signin")}>Sign in</button><button type="button" className={authMode==="signup"?"selected":""} onClick={()=>setAuthMode("signup")}>Create account</button></div><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" minLength="8" autoComplete={authMode==="signup"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary full" disabled={authBusy}>{authBusy?"Please wait…":authMode==="signup"?"Create account":"Sign in"} <LockKeyhole size={16}/></button>{authMessage&&<p className="auth-message">{authMessage}</p>}<p className="tiny muted">Use your own account. Never ask your partner for their password or private health records.</p></form>}
        </>}
        <div className="info"><strong>Cloud sync notes</strong><p>Sync is off by default. When enabled, the app uploads the current local dataset to the signed-in account. This is an early MVP: use a dedicated account and test carefully before storing real health data. Data already uploaded remains in the cloud if you turn sync off; delete cloud entries from the account before stopping use.</p></div>
        <button className="danger full" onClick={deleteAll}><Trash2 size={16}/> Delete local data</button>
      </section>}
    </main>
    <nav className="bottom-nav">{[["home","Home",Heart],["cycle","Cycle",CalendarDays],["checkin","Check-in",Smile],["calm","Calm",Sparkles],["journal","Journal",BookHeart]].map(([k,v,Icon])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}><Icon size={19}/><span>{v}</span></button>)}</nav>
    <footer><span>made with care <Heart size={12} fill="currentColor"/></span><span>VedaBloom · private wellness MVP</span></footer>
  </div>;
}
function currentBreathPhase(preset,elapsed) {
  const cycle=preset.phases.reduce((sum,phase)=>sum+phase.seconds,0);
  let position=elapsed%cycle;
  for(const phase of preset.phases){if(position<phase.seconds)return phase;position-=phase.seconds;}
  return preset.phases[0];
}
function currentBreathRemaining(preset,elapsed) {
  const cycle=preset.phases.reduce((sum,phase)=>sum+phase.seconds,0);
  let position=elapsed%cycle;
  for(const phase of preset.phases){if(position<phase.seconds)return phase.seconds-position;position-=phase.seconds;}
  return preset.phases[0].seconds;
}
function Back({onClick}) { return <button className="back" onClick={onClick}><ChevronLeft size={17}/> Home</button>; }
