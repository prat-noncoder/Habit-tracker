import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "FIREBASE_API_KEY",
    authDomain: "habit-tracker-c996a.firebaseapp.com",
    projectId: "habit-tracker-c996a",
    storageBucket: "habit-tracker-c996a.firebasestorage.app",
    messagingSenderId: "42670113378",
    appId: "1:42670113378:web:3c37c8e8c24cc0d142473b"
  };
  const fbApp = initializeApp(firebaseConfig);
  const db = getFirestore(fbApp);
  const NAMESPACE = "45a2b09abfc44039b3c579db5b003fcc";
  function dataDoc(key){ return doc(db, 'households', NAMESPACE, 'data', key); }

(function(){

  const PALETTE = ['#34D399','#38BDF8','#A78BFA','#FB7185','#FB923C','#FBBF24','#22D3EE','#A3E635'];
  const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 24;

  let state = { name: '', habits: [], logs: {}, reminders: [] };

  let selectedDate = fmtDate(new Date());
  let currentDetailHabit = null;
  let detailMonthCursor = new Date();
  let pickerMonthCursor = new Date();
  let ctxTarget = null; // {type:'habit'|'reminder', id}

  function fmtDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function uid(){ return Math.random().toString(36).slice(2,10); }
  function escapeHtml(s){ const div=document.createElement('div'); div.textContent=s; return div.innerHTML; }

  // ---------- CONFIRM MODAL ----------
  function askConfirm(message){
    return new Promise((resolve)=>{
      document.getElementById('confirmModalBody').textContent = message;
      document.getElementById('confirmModalBackdrop').classList.add('active');
      const okBtn = document.getElementById('confirmOkBtn');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      function cleanup(result){
        document.getElementById('confirmModalBackdrop').classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk(){ cleanup(true); }
      function onCancel(){ cleanup(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  // ---------- STORAGE (Firebase Firestore) ----------
  async function loadState(){
    try{
      const [profileSnap, habitsSnap, remindersSnap] = await Promise.allSettled([
        getDoc(dataDoc('profile')),
        getDoc(dataDoc('habits-data')),
        getDoc(dataDoc('reminders-data'))
      ]);
      if(profileSnap.status==='fulfilled' && profileSnap.value.exists()) state.name = profileSnap.value.data().name || '';
      if(habitsSnap.status==='fulfilled' && habitsSnap.value.exists()){
        const d = habitsSnap.value.data();
        state.habits = d.habits || []; state.logs = d.logs || {};
      }
      if(remindersSnap.status==='fulfilled' && remindersSnap.value.exists()){
        state.reminders = remindersSnap.value.data().reminders || [];
      }
    }catch(e){ console.error('load error', e); }
  }
  async function saveProfile(){ try{ await setDoc(dataDoc('profile'), {name: state.name}); }catch(e){ console.error('save profile failed', e); } }
  async function saveHabits(){ try{ await setDoc(dataDoc('habits-data'), {habits: state.habits, logs: state.logs}); }catch(e){ console.error('save habits failed', e); } }
  async function saveReminders(){ try{ await setDoc(dataDoc('reminders-data'), {reminders: state.reminders}); }catch(e){ console.error('save reminders failed', e); } }

  // ---------- NAV ----------
  document.querySelectorAll('.nav-btn').forEach(btn=> btn.addEventListener('click', ()=> showScreen(btn.dataset.screen)));
  function showScreen(name){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    if(name==='detail'){
      document.getElementById('screen-detail').classList.add('active');
      document.getElementById('fabBtn').style.display='none';
      return;
    }
    document.getElementById('screen-'+name).classList.add('active');
    const navBtn = document.querySelector('.nav-btn[data-screen="'+name+'"]');
    if(navBtn) navBtn.classList.add('active');
    document.getElementById('fabBtn').style.display='flex';
    document.getElementById('greetingLabel').textContent = name==='today' ? 'TODAY' : (name==='progress' ? 'PROGRESS' : 'REMINDERS');
  }

  // ---------- DAILY SCORE ----------
  function renderScore(){
    const total = state.habits.length;
    let done = 0;
    state.habits.forEach(h=>{ if(state.logs[h.id] && state.logs[h.id][selectedDate]) done++; });
    document.getElementById('scoreFrac').innerHTML = done+'<span>/'+total+'</span>';
    const pct = total===0 ? 0 : Math.round((done/total)*100);
    document.getElementById('scoreRingPct').textContent = pct+'%';
    const fillLen = (pct/100) * RING_CIRCUMFERENCE;
    document.getElementById('scoreRingFill').setAttribute('stroke-dasharray', fillLen+' '+RING_CIRCUMFERENCE);
    let sub = 'Ready to begin';
    if(total===0) sub = 'Add a habit to start';
    else if(done===0) sub = 'Ready to begin';
    else if(done===total) sub = 'All done — nice work';
    else sub = 'Keep going';
    document.getElementById('scoreSub').textContent = sub;
  }

  // ---------- TODAY: week strip ----------
  let stripMonthCursor = new Date();
  function renderWeekStrip(){
    document.getElementById('stripMonthLabel').textContent = MONTHS[stripMonthCursor.getMonth()]+' '+stripMonthCursor.getFullYear();
    const y = stripMonthCursor.getFullYear(), mo = stripMonthCursor.getMonth();
    const daysInMonth = new Date(y, mo+1, 0).getDate();
    const count = Math.min(7, daysInMonth);
    const wrap = document.getElementById('weekStrip');
    wrap.innerHTML = '';
    for(let day=1; day<=count; day++){
      const key = y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      const d = new Date(y, mo, day);
      const el = document.createElement('div');
      el.className = 'week-day' + (key===selectedDate ? ' selected' : '');
      el.innerHTML = `<span class="wd-label">${DOW[d.getDay()].slice(0,2).charAt(0)+DOW[d.getDay()].slice(1,2).toLowerCase()}</span><span class="wd-num">${day}</span>`;
      el.addEventListener('click', ()=>{
        selectedDate = key;
        renderWeekStrip(); renderHabitList(); renderScore();
      });
      wrap.appendChild(el);
    }
  }
  document.getElementById('stripPrev').addEventListener('click', ()=>{ stripMonthCursor.setMonth(stripMonthCursor.getMonth()-1); renderWeekStrip(); });
  document.getElementById('stripNext').addEventListener('click', ()=>{ stripMonthCursor.setMonth(stripMonthCursor.getMonth()+1); renderWeekStrip(); });
  document.getElementById('stripCalendarBtn').addEventListener('click', ()=>{
    pickerMonthCursor = new Date(selectedDate+'T00:00:00');
    renderPicker();
    document.getElementById('pickerModalBackdrop').classList.add('active');
  });

  // ---------- Generic month grid builder ----------
  function buildMonthCells(cursorDate, opts){
    const y = cursorDate.getFullYear(), mo = cursorDate.getMonth();
    const daysInMonth = new Date(y, mo+1, 0).getDate();
    const firstDow = new Date(y, mo, 1).getDay();
    const today = fmtDate(new Date());
    let html = '';
    for(let i=0;i<firstDow;i++) html += '<div class="day-box empty"></div>';
    for(let day=1; day<=daysInMonth; day++){
      const key = y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      const filled = opts.getFilled ? opts.getFilled(key) : false;
      const color = filled && opts.getColor ? opts.getColor(key) : null;
      const isToday = key===today;
      const isFuture = key > today;
      let cls = 'day-box';
      if(filled) cls += ' filled';
      if(isToday && opts.markToday) cls += ' today-mark';
      if(isFuture && opts.disableFuture) cls += ' future';
      html += `<div class="${cls}" data-key="${key}" style="${filled?'background:'+color:''}">${opts.showNum?day:''}</div>`;
    }
    return html;
  }

  // ---------- PICKER MODAL ----------
  function renderPicker(){
    document.getElementById('pickerLabel').textContent = MONTHS[pickerMonthCursor.getMonth()]+' '+pickerMonthCursor.getFullYear();
    const grid = document.getElementById('pickerGrid');
    grid.innerHTML = buildMonthCells(pickerMonthCursor, {
      getFilled:(k)=> k===selectedDate,
      getColor:()=> 'var(--accent)',
      showNum:true,
      disableFuture:true,
      markToday:true
    });
    grid.querySelectorAll('.day-box[data-key]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const key = el.dataset.key;
        if(key > fmtDate(new Date())) return;
        selectedDate = key;
        document.getElementById('pickerModalBackdrop').classList.remove('active');
        stripMonthCursor = new Date(selectedDate+'T00:00:00');
        renderWeekStrip(); renderHabitList(); renderScore();
      });
    });
  }
  document.getElementById('pickerPrev').addEventListener('click', ()=>{ pickerMonthCursor.setMonth(pickerMonthCursor.getMonth()-1); renderPicker(); });
  document.getElementById('pickerNext').addEventListener('click', ()=>{
    const next = new Date(pickerMonthCursor); next.setMonth(next.getMonth()+1);
    if(next > new Date()) return;
    pickerMonthCursor = next; renderPicker();
  });
  document.getElementById('pickerCancel').addEventListener('click', ()=> document.getElementById('pickerModalBackdrop').classList.remove('active'));
  document.getElementById('pickerModalBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='pickerModalBackdrop') e.currentTarget.classList.remove('active'); });

  // ---------- TODAY: habit list ----------
  function renderHabitList(){
    const list = document.getElementById('habitList');
    const label = document.getElementById('habitListLabel');
    label.textContent = 'Habits';

    list.innerHTML = '';
    if(state.habits.length===0){
      list.innerHTML = `<div class="empty-state">No habits yet.<br>Tap + to add your first one.</div>`;
      return;
    }
    state.habits.forEach(h=>{
      const done = !!(state.logs[h.id] && state.logs[h.id][selectedDate]);
      const card = document.createElement('div');
      card.className = 'habit-card';
      card.innerHTML = `
        <div class="check-circle ${done?'checked':''}" style="${done?'background:'+h.color+';border-color:'+h.color:''}" data-habit="${h.id}">${CHECK_SVG}</div>
        <div class="habit-card-body" data-habit-edit="${h.id}">
          <span class="habit-name ${done?'done':''}">${escapeHtml(h.name)}</span>
          ${h.time ? `<span class="habit-time">${h.time}</span>` : ''}
        </div>
        <button class="trash-btn" data-habit-delete="${h.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg></button>
      `;
      card.querySelector('.check-circle').addEventListener('click', ()=> toggleHabit(h.id));
      card.querySelector('.habit-card-body').addEventListener('click', ()=> openHabitModal(h));
      card.querySelector('.trash-btn').addEventListener('click', async ()=>{
        const ok = await askConfirm('Delete "'+h.name+'"? This removes its whole history too.');
        if(!ok) return;
        state.habits = state.habits.filter(x=>x.id!==h.id);
        delete state.logs[h.id];
        await saveHabits();
        renderHabitList(); renderProgressList(); renderScore();
      });
      list.appendChild(card);
    });
  }
  // ---------- CELEBRATION ----------
  function celebrate(){
    const overlay = document.createElement('div');
    overlay.className = 'celebrate-overlay';
    const msg = document.createElement('div');
    msg.className = 'celebrate-msg';
    msg.textContent = 'All done! 🎉';
    overlay.appendChild(msg);
    document.body.appendChild(overlay);
    setTimeout(()=> overlay.remove(), 2500);

    const colors = PALETTE;
    const count = 60;
    for(let i=0;i<count;i++){
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const color = colors[Math.floor(Math.random()*colors.length)];
      piece.style.background = color;
      piece.style.left = Math.random()*100+'vw';
      piece.style.borderRadius = Math.random()>0.5 ? '50%' : '2px';
      const duration = 2 + Math.random()*1.5;
      const delay = Math.random()*0.4;
      piece.style.animationDuration = duration+'s';
      piece.style.animationDelay = delay+'s';
      document.body.appendChild(piece);
      setTimeout(()=> piece.remove(), (duration+delay)*1000 + 200);
    }
  }

  async function toggleHabit(id){
    const total = state.habits.length;
    const wasComplete = total>0 && state.habits.every(h=> state.logs[h.id] && state.logs[h.id][selectedDate]);
    if(!state.logs[id]) state.logs[id] = {};
    if(state.logs[id][selectedDate]) delete state.logs[id][selectedDate];
    else state.logs[id][selectedDate] = true;
    const nowComplete = total>0 && state.habits.every(h=> state.logs[h.id] && state.logs[h.id][selectedDate]);
    renderHabitList();
    renderProgressList();
    renderScore();
    await saveHabits();
    if(nowComplete && !wasComplete) celebrate();
  }

  // ---------- PROGRESS screen ----------
  function last7Dates(){
    const arr = []; const today = new Date();
    for(let i=6;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); arr.push(fmtDate(d)); }
    return arr;
  }
  function renderProgressList(){
    const wrap = document.getElementById('progressList');
    wrap.innerHTML = '';
    if(state.habits.length===0){
      wrap.innerHTML = `<div class="empty-state">Nothing to show yet.<br>Add a habit from the Today tab.</div>`;
      return;
    }
    const days = last7Dates();
    state.habits.forEach(h=>{
      const streak = currentStreak(h.id);
      const card = document.createElement('div');
      card.className = 'habit-progress-card';
      card.innerHTML = `
        <div class="hp-head">
          <span class="habit-name">${escapeHtml(h.name)}</span>
          <span class="hp-streak">${streak} day${streak===1?'':'s'} 🔥</span>
        </div>
        <div class="hp-grid">
          ${days.map(dk=>{
            const filled = !!(state.logs[h.id] && state.logs[h.id][dk]);
            return `<div class="box ${filled?'filled':''}" style="${filled?'background:'+h.color:''}"></div>`;
          }).join('')}
        </div>
      `;
      card.addEventListener('click', ()=> openDetail(h));
      wrap.appendChild(card);
    });
  }
  function currentStreak(habitId){
    let streak = 0; let d = new Date();
    while(true){
      const key = fmtDate(d);
      if(state.logs[habitId] && state.logs[habitId][key]){ streak++; d.setDate(d.getDate()-1); } else break;
    }
    return streak;
  }
  function bestStreak(habitId){
    const log = state.logs[habitId] || {};
    const dates = Object.keys(log).filter(k=>log[k]).sort();
    if(dates.length===0) return 0;
    let best=1, cur=1;
    for(let i=1;i<dates.length;i++){
      const prev = new Date(dates[i-1]+'T00:00:00');
      const curD = new Date(dates[i]+'T00:00:00');
      const diff = (curD-prev)/86400000;
      if(diff===1){ cur++; best=Math.max(best,cur); } else cur=1;
    }
    return Math.max(best,cur);
  }

  function openDetail(h){
    currentDetailHabit = h;
    detailMonthCursor = new Date();
    document.getElementById('detailTitle').innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${h.color};display:inline-block;"></span> ${escapeHtml(h.name)}`;
    document.getElementById('detailStreak').textContent = currentStreak(h.id);
    document.getElementById('detailBest').textContent = bestStreak(h.id);
    const log = state.logs[h.id] || {};
    document.getElementById('detailTotal').textContent = Object.values(log).filter(Boolean).length;
    renderDetailMonth();
    showScreen('detail');
  }
  document.getElementById('detailBack').addEventListener('click', ()=> showScreen('progress'));

  function renderDetailMonth(){
    if(!currentDetailHabit) return;
    document.getElementById('monthLabel').textContent = MONTHS[detailMonthCursor.getMonth()]+' '+detailMonthCursor.getFullYear();
    const log = state.logs[currentDetailHabit.id] || {};
    const grid = document.getElementById('monthGrid');
    grid.innerHTML = buildMonthCells(detailMonthCursor, {
      getFilled:(k)=> !!log[k],
      getColor:()=> currentDetailHabit.color,
      showNum:true,
      markToday:true,
      disableFuture:true
    });
  }
  document.getElementById('monthPrev').addEventListener('click', ()=>{ detailMonthCursor.setMonth(detailMonthCursor.getMonth()-1); renderDetailMonth(); });
  document.getElementById('monthNext').addEventListener('click', ()=>{
    const next = new Date(detailMonthCursor); next.setMonth(next.getMonth()+1);
    if(next > new Date()) return;
    detailMonthCursor = next; renderDetailMonth();
  });

  // ---------- REMINDERS screen ----------
  function renderReminders(){
    const pendingWrap = document.getElementById('reminderPendingList');
    const doneWrapOuter = document.getElementById('reminderDoneWrap');
    pendingWrap.innerHTML = ''; doneWrapOuter.innerHTML = '';
    const pending = state.reminders.filter(r=>!r.done);
    const done = state.reminders.filter(r=>r.done);
    if(pending.length===0 && done.length===0){
      pendingWrap.innerHTML = `<div class="empty-state">No reminders yet.<br>Tap + to add one.</div>`;
    } else if(pending.length===0){
      pendingWrap.innerHTML = `<div class="empty-state">All clear. Nothing pending.</div>`;
    } else {
      pending.sort((a,b)=> (a.time||'99:99').localeCompare(b.time||'99:99'));
      pending.forEach(r=> pendingWrap.appendChild(reminderCard(r)));
    }
    if(done.length>0){
      const divider = document.createElement('div');
      divider.className = 'done-divider'; divider.textContent = 'Done';
      doneWrapOuter.appendChild(divider);
      const doneList = document.createElement('div'); doneList.className = 'list';
      done.forEach(r=> doneList.appendChild(reminderCard(r)));
      doneWrapOuter.appendChild(doneList);
    }
  }
  function reminderCard(r){
    const card = document.createElement('div');
    card.className = 'reminder-card';
    const repeatLabel = r.repeat==='daily' ? 'Daily' : r.repeat==='weekly' ? 'Weekly' : 'One-time';
    card.innerHTML = `
      <div class="reminder-tag-check ${r.done?'checked':''}" style="${r.done?'background:'+r.color+';border-color:'+r.color:''}" data-reminder="${r.id}">${CHECK_SVG}</div>
      <div class="reminder-body">
        <div class="reminder-text ${r.done?'done':''}">${escapeHtml(r.text)}</div>
        <div class="reminder-meta">${r.time ? r.time+' · ' : ''}${repeatLabel}</div>
      </div>
      <button class="dots-btn" data-reminder-menu="${r.id}">⋯</button>
    `;
    card.querySelector('.reminder-tag-check').addEventListener('click', ()=> toggleReminder(r.id));
    card.querySelector('.dots-btn').addEventListener('click', (e)=> openCtxMenu(e, 'reminder', r.id));
    return card;
  }
  async function toggleReminder(id){
    const r = state.reminders.find(x=>x.id===id);
    if(!r) return;
    r.done = !r.done; r.doneAt = r.done ? Date.now() : null;
    renderReminders();
    await saveReminders();
  }

  // ---------- CONTEXT MENU ----------
  function openCtxMenu(e, type, id){
    e.stopPropagation();
    ctxTarget = {type, id};
    const menu = document.getElementById('ctxMenu');
    const rect = e.target.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(12, rect.right - 150) + 'px';
    menu.classList.add('active');
    document.getElementById('ctxBackdrop').classList.add('active');
  }
  function closeCtxMenu(){
    document.getElementById('ctxMenu').classList.remove('active');
    document.getElementById('ctxBackdrop').classList.remove('active');
  }
  document.getElementById('ctxBackdrop').addEventListener('click', closeCtxMenu);
  document.getElementById('ctxEdit').addEventListener('click', ()=>{
    if(!ctxTarget) return;
    closeCtxMenu();
    if(ctxTarget.type==='habit') openHabitModal(state.habits.find(h=>h.id===ctxTarget.id));
    else openReminderModal(state.reminders.find(r=>r.id===ctxTarget.id));
  });
  document.getElementById('ctxDelete').addEventListener('click', async ()=>{
    if(!ctxTarget) return;
    if(ctxTarget.type==='habit'){
      state.habits = state.habits.filter(h=>h.id!==ctxTarget.id);
      delete state.logs[ctxTarget.id];
      await saveHabits();
      renderHabitList(); renderProgressList(); renderScore();
    } else {
      state.reminders = state.reminders.filter(r=>r.id!==ctxTarget.id);
      await saveReminders();
      renderReminders();
    }
    closeCtxMenu();
  });

  // ---------- HABIT MODAL ----------
  let editingHabitId = null;
  let selectedHabitColor = PALETTE[0];
  function buildColorRow(container, onSelect, initial){
    container.innerHTML = '';
    PALETTE.forEach(c=>{
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c===initial ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', ()=>{
        container.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected'));
        sw.classList.add('selected'); onSelect(c);
      });
      container.appendChild(sw);
    });
  }
  function openHabitModal(h){
    editingHabitId = h ? h.id : null;
    document.getElementById('habitModalTitle').textContent = h ? 'Edit habit' : 'New habit';
    document.getElementById('habitNameInput').value = h ? h.name : '';
    document.getElementById('habitTimeInput').value = h ? (h.time||'') : '';
    selectedHabitColor = h ? h.color : PALETTE[Math.floor(Math.random()*PALETTE.length)];
    buildColorRow(document.getElementById('habitColorRow'), c=>selectedHabitColor=c, selectedHabitColor);
    document.getElementById('habitModalBackdrop').classList.add('active');
  }
  function closeHabitModal(){ document.getElementById('habitModalBackdrop').classList.remove('active'); }
  document.getElementById('habitCancelBtn').addEventListener('click', closeHabitModal);
  document.getElementById('habitSaveBtn').addEventListener('click', async ()=>{
    const name = document.getElementById('habitNameInput').value.trim();
    if(!name) return;
    const time = document.getElementById('habitTimeInput').value;
    if(editingHabitId){
      const h = state.habits.find(x=>x.id===editingHabitId);
      h.name = name; h.color = selectedHabitColor; h.time = time;
    } else {
      state.habits.push({id:uid(), name, color:selectedHabitColor, time});
    }
    await saveHabits();
    renderHabitList(); renderProgressList(); renderScore();
    closeHabitModal();
  });

  // ---------- REMINDER MODAL ----------
  let editingReminderId = null;
  let selectedReminderColor = PALETTE[0];
  let selectedRepeat = 'once';
  function openReminderModal(r){
    editingReminderId = r ? r.id : null;
    document.getElementById('reminderModalTitle').textContent = r ? 'Edit reminder' : 'New reminder';
    document.getElementById('reminderTextInput').value = r ? r.text : '';
    document.getElementById('reminderTimeInput').value = r ? (r.time||'') : '';
    selectedReminderColor = r ? r.color : PALETTE[Math.floor(Math.random()*PALETTE.length)];
    selectedRepeat = r ? r.repeat : 'once';
    buildColorRow(document.getElementById('reminderColorRow'), c=>selectedReminderColor=c, selectedReminderColor);
    document.querySelectorAll('#reminderRepeatRow .repeat-opt').forEach(el=> el.classList.toggle('selected', el.dataset.val===selectedRepeat));
    document.getElementById('reminderModalBackdrop').classList.add('active');
  }
  function closeReminderModal(){ document.getElementById('reminderModalBackdrop').classList.remove('active'); }
  document.querySelectorAll('#reminderRepeatRow .repeat-opt').forEach(el=>{
    el.addEventListener('click', ()=>{
      selectedRepeat = el.dataset.val;
      document.querySelectorAll('#reminderRepeatRow .repeat-opt').forEach(x=>x.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
  document.getElementById('reminderCancelBtn').addEventListener('click', closeReminderModal);
  document.getElementById('reminderSaveBtn').addEventListener('click', async ()=>{
    const text = document.getElementById('reminderTextInput').value.trim();
    if(!text) return;
    const time = document.getElementById('reminderTimeInput').value;
    if(editingReminderId){
      const r = state.reminders.find(x=>x.id===editingReminderId);
      r.text=text; r.time=time; r.repeat=selectedRepeat; r.color=selectedReminderColor;
    } else {
      state.reminders.push({id:uid(), text, time, repeat:selectedRepeat, color:selectedReminderColor, done:false, doneAt:null});
    }
    await saveReminders();
    renderReminders();
    closeReminderModal();
  });

  // ---------- FAB ----------
  document.getElementById('fabBtn').addEventListener('click', ()=>{
    const active = document.querySelector('.screen.active').id;
    if(active==='screen-reminders') openReminderModal(null);
    else openHabitModal(null);
  });

  // ---------- NAME MODAL ----------
  document.getElementById('nameSaveBtn').addEventListener('click', async ()=>{
    const val = document.getElementById('nameInput').value.trim();
    if(!val) return;
    state.name = val;
    document.getElementById('nameDisplay').textContent = val;
    document.getElementById('nameModalBackdrop').classList.remove('active');
    await saveProfile();
  });

  // ---------- INIT ----------
  async function init(){
    await loadState();
    document.getElementById('nameDisplay').textContent = state.name || '—';
    if(!state.name) document.getElementById('nameModalBackdrop').classList.add('active');
    renderWeekStrip();
    renderHabitList();
    renderProgressList();
    renderReminders();
    renderScore();
  }
  init();

})();
