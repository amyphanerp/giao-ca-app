import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const SHIFTS = [
  { id: "ca1", label: "Ca 1", time: "06:00–14:00", icon: "🌅" },
  { id: "ca2", label: "Ca 2", time: "14:00–22:00", icon: "☀️" },
  { id: "ca3", label: "Ca 3", time: "22:00–06:00", icon: "🌙" },
];
const SUPERVISOR_LIST = ["Linh", "Thảo", "Tuấn Anh"];
const SECTIONS = [
  { key: "mayMoc",   label: "Máy móc",   icon: "⚙️", placeholder: "Tình trạng máy, sự cố, bảo trì..." },
  { key: "vatTu",    label: "Vật tư",    icon: "📦", placeholder: "Tồn kho, thiếu hụt, cấp phát..." },
  { key: "quyTrinh", label: "Quy trình", icon: "📋", placeholder: "Tuân thủ SOP, thay đổi, cải tiến..." },
  { key: "conNguoi", label: "Con người", icon: "👥", placeholder: "Đủ nhân sự, vắng, tăng ca, an toàn..." },
  { key: "deXuat",   label: "Đề xuất",   icon: "💡", placeholder: "Kiến nghị, cải tiến, cần hỗ trợ..." },
];
const EMPTY_FORM = { mayMoc:"", vatTu:"", quyTrinh:"", conNguoi:"", deXuat:"", images:[], submittedAt:null, supervisor:"" };
const EMPTY_NOTICE = { text:"", images:[], posted_at:null };

function todayKey() { return new Date().toISOString().slice(0,10); }
function nowStr() { return new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}); }
function fmtDate(key) {
  const d = new Date(key+"T00:00:00");
  return d.toLocaleDateString("vi-VN",{weekday:"short",day:"numeric",month:"numeric",year:"numeric"});
}
function fmtDateShort(key) {
  const d = new Date(key+"T00:00:00");
  return d.toLocaleDateString("vi-VN",{day:"numeric",month:"numeric"});
}

// ── STATUS PILL ───────────────────────────────────────────────────────────────
function Pill({ done, small }) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:4,
      padding:small?"2px 8px":"3px 10px",
      borderRadius:20,fontSize:small?10:11,fontWeight:700,
      background:done?"#DCFCE7":"#FEE2E2",
      color:done?"#16A34A":"#DC2626",
    }}>
      <span style={{fontSize:7}}>●</span>{done?"Đã giao":"Chưa giao"}
    </span>
  );
}

// ── IMAGE UPLOAD ──────────────────────────────────────────────────────────────
function ImageUpload({ images, onChange, disabled }) {
  const ref = useRef();
  const pick = (e) => Array.from(e.target.files).forEach(f => {
    const r = new FileReader();
    r.onload = ev => onChange(p => [...p, { src:ev.target.result, name:f.name }]);
    r.readAsDataURL(f);
  });
  return (
    <div style={{marginTop:4}}>
      <div style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>
        📷 Hình ảnh đính kèm
      </div>
      {!disabled && (
        <div onClick={()=>ref.current.click()} style={{
          border:"1.5px dashed #CBD5E1",borderRadius:8,padding:"10px",
          textAlign:"center",cursor:"pointer",background:"#F8FAFC",marginBottom:8,
        }}>
          <div style={{fontSize:18}}>📷</div>
          <div style={{fontSize:11,color:"#94A3B8"}}>Chụp hoặc chọn ảnh</div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={pick}/>
      {images.length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {images.map((img,i)=>(
            <div key={i} style={{position:"relative"}}>
              <img src={img.src} alt="" style={{width:60,height:60,objectFit:"cover",borderRadius:6,display:"block"}}/>
              {!disabled && (
                <button onClick={()=>onChange(p=>p.filter((_,j)=>j!==i))} style={{
                  position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.6)",
                  color:"#fff",border:"none",borderRadius:"50%",width:15,height:15,fontSize:8,cursor:"pointer",
                }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SECTION FIELD ─────────────────────────────────────────────────────────────
function SectionField({ sec, value, onChange, disabled }) {
  const [open,setOpen] = useState(true);
  const filled = value && value.trim().length>0;
  return (
    <div style={{marginBottom:10,border:"1.5px solid #E2E8F0",borderRadius:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 12px",cursor:"pointer",
        background:filled?"#F0FDF4":"#FAFAFA",
        borderBottom:open?"1px solid #E2E8F0":"none",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{sec.icon}</span>
          <span style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>{sec.label}</span>
          {filled && <span style={{fontSize:9,color:"#16A34A"}}>●</span>}
        </div>
        <span style={{color:"#94A3B8",fontSize:12,transform:open?"rotate(180deg)":"rotate(0)",display:"inline-block",transition:"transform 0.2s"}}>▾</span>
      </div>
      {open && (
        <div style={{padding:"10px 12px",background:"#fff"}}>
          <textarea value={value} onChange={onChange} placeholder={sec.placeholder} disabled={disabled} rows={2}
            style={{width:"100%",border:"none",outline:"none",resize:"vertical",fontSize:13,lineHeight:1.6,
              fontFamily:"inherit",background:"transparent",color:disabled?"#64748B":"#1E293B",boxSizing:"border-box"}}/>
        </div>
      )}
    </div>
  );
}

// ── MANAGER NOTICE ────────────────────────────────────────────────────────────
function NoticeDisplay({ notice }) {
  if (!notice||(!notice.text&&notice.images.length===0)) return null;
  return (
    <div style={{background:"linear-gradient(135deg,#FFF7ED,#FFFBF0)",border:"2px solid #FB923C",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:notice.text?7:0}}>
        <span style={{fontSize:16}}>📢</span>
        <span style={{fontWeight:800,fontSize:12,color:"#C2410C",textTransform:"uppercase",letterSpacing:0.8}}>Thông báo từ Manager</span>
        {notice.posted_at && <span style={{fontSize:10,color:"#94A3B8",marginLeft:"auto"}}>{notice.posted_at}</span>}
      </div>
      {notice.text && <div style={{fontSize:13,color:"#1E293B",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{notice.text}</div>}
      {notice.images.length>0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {notice.images.map((img,i)=>(
            <img key={i} src={img.src} alt="" style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:"1px solid #FED7AA"}}/>
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeEditor({ notice, onSave }) {
  const [editing,setEditing] = useState(false);
  const [draft,setDraft] = useState(notice);
  const imgRef = useRef();
  const [saving,setSaving] = useState(false);

  useEffect(()=>{ if(!editing) setDraft(notice); },[notice,editing]);

  const handleSave = async () => {
    setSaving(true);
    const saved = { ...draft, posted_at:nowStr() };
    await onSave(saved);
    setSaving(false);
    setEditing(false);
  };
  const handleClear = async () => {
    const cleared = { text:"", images:[], posted_at:null };
    await onSave(cleared);
    setEditing(false);
  };
  const pickImages = (e) => Array.from(e.target.files).forEach(f=>{
    const r=new FileReader();
    r.onload=ev=>setDraft(p=>({...p,images:[...p.images,{src:ev.target.result,name:f.name}]}));
    r.readAsDataURL(f);
  });
  const hasContent = notice.text||notice.images.length>0;
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontWeight:700,fontSize:12,color:"#64748B",textTransform:"uppercase",letterSpacing:0.8}}>
          📢 Thông báo chung cho Supervisor
        </div>
        <div style={{display:"flex",gap:6}}>
          {hasContent&&!editing&&(
            <button onClick={handleClear} style={{padding:"4px 10px",borderRadius:6,border:"1.5px solid #FCA5A5",background:"#FFF5F5",color:"#EF4444",fontSize:11,fontWeight:600,cursor:"pointer"}}>Xoá</button>
          )}
          <button onClick={()=>setEditing(e=>!e)} style={{padding:"4px 12px",borderRadius:6,border:"1.5px solid #CBD5E1",background:editing?"#F1F5F9":"#fff",color:"#475569",fontSize:11,fontWeight:600,cursor:"pointer"}}>
            {editing?"Huỷ":hasContent?"Sửa":"+ Thêm"}
          </button>
        </div>
      </div>
      {!editing&&hasContent&&<NoticeDisplay notice={notice}/>}
      {!editing&&!hasContent&&(
        <div style={{border:"1.5px dashed #E2E8F0",borderRadius:10,padding:"14px",textAlign:"center",color:"#94A3B8",fontSize:12}}>
          Chưa có thông báo — supervisor sẽ thấy khi bạn thêm
        </div>
      )}
      {editing&&(
        <div style={{border:"2px solid #FB923C",borderRadius:12,padding:"14px",background:"#FFFBF5"}}>
          <textarea value={draft.text} onChange={e=>setDraft(p=>({...p,text:e.target.value}))}
            placeholder="Nhập thông báo, lưu ý chung cho tất cả supervisor hôm nay..." rows={3}
            style={{width:"100%",border:"1.5px solid #FED7AA",borderRadius:8,padding:"8px 10px",fontSize:13,
              lineHeight:1.6,fontFamily:"inherit",resize:"vertical",outline:"none",background:"#fff",boxSizing:"border-box",marginBottom:10}}/>
          <div onClick={()=>imgRef.current.click()} style={{border:"1.5px dashed #FCD9B0",borderRadius:8,padding:"8px",textAlign:"center",cursor:"pointer",background:"#fff",marginBottom:10}}>
            <span style={{fontSize:14}}>📷</span>
            <span style={{fontSize:11,color:"#94A3B8",marginLeft:6}}>Đính kèm hình ảnh</span>
          </div>
          <input ref={imgRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={pickImages}/>
          {draft.images.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {draft.images.map((img,i)=>(
                <div key={i} style={{position:"relative"}}>
                  <img src={img.src} alt="" style={{width:60,height:60,objectFit:"cover",borderRadius:6}}/>
                  <button onClick={()=>setDraft(p=>({...p,images:p.images.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.6)",color:"#fff",border:"none",borderRadius:"50%",width:15,height:15,fontSize:8,cursor:"pointer"}}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{width:"100%",padding:"9px",borderRadius:8,background:saving?"#E2E8F0":"linear-gradient(135deg,#EA580C,#F97316)",color:saving?"#94A3B8":"#fff",border:"none",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer"}}>
            {saving?"Đang lưu...":"📢 Đăng thông báo"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── DATE OPTIONS ─────────────────────────────────────────────────────────────
function getDateOptions() {
  const opts = [];
  const labels = ["Hôm nay","Hôm qua","Hôm trước"];
  for(let i=0;i<3;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    opts.push({ key: d.toISOString().slice(0,10), label: labels[i] });
  }
  return opts;
}

// ── SUPERVISOR VIEW ───────────────────────────────────────────────────────────
function SupervisorView({ history, onSubmit, notice }) {
  const dateOptions = getDateOptions();
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].key);
  const [activeShift, setActiveShift] = useState("ca1");
  const [submitting, setSubmitting] = useState(false);

  const dayShifts = history[selectedDate] || { ca1:{...EMPTY_FORM}, ca2:{...EMPTY_FORM}, ca3:{...EMPTY_FORM} };
  const [forms, setForms] = useState({
    ca1:{...EMPTY_FORM,...(dayShifts.ca1||{})},
    ca2:{...EMPTY_FORM,...(dayShifts.ca2||{})},
    ca3:{...EMPTY_FORM,...(dayShifts.ca3||{})},
  });

  // Reload forms when date changes
  useEffect(()=>{
    const ds = history[selectedDate] || { ca1:{...EMPTY_FORM}, ca2:{...EMPTY_FORM}, ca3:{...EMPTY_FORM} };
    setForms({
      ca1:{...EMPTY_FORM,...(ds.ca1||{})},
      ca2:{...EMPTY_FORM,...(ds.ca2||{})},
      ca3:{...EMPTY_FORM,...(ds.ca3||{})},
    });
  },[selectedDate, history]);

  const cur = forms[activeShift];
  const isDone = !!cur.submittedAt;
  const shift = SHIFTS.find(s=>s.id===activeShift);
  const setField = (key,val) => setForms(p=>({...p,[activeShift]:{...p[activeShift],[key]:val}}));

  const handleSubmit = async () => {
    if (!cur.supervisor) return;
    setSubmitting(true);
    const updated = {...cur, submittedAt:nowStr()};
    await onSubmit(activeShift, updated, selectedDate);
    setForms(p=>({...p,[activeShift]:updated}));
    setSubmitting(false);
  };

  return (
    <div>
      <NoticeDisplay notice={notice}/>

      {/* Date selector */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📅 Chọn ngày giao ca</div>
        <div style={{display:"flex",gap:8}}>
          {dateOptions.map(opt=>{
            const isSel = opt.key===selectedDate;
            const dc = SHIFTS.filter(s=>(history[opt.key]||{})[s.id]?.submittedAt).length;
            return (
              <button key={opt.key} onClick={()=>setSelectedDate(opt.key)} style={{
                flex:1, padding:"9px 8px", borderRadius:10, border:"none", cursor:"pointer",
                background:isSel?"#1E3A5F":"#fff",
                color:isSel?"#fff":"#475569",
                fontWeight:isSel?700:500, fontSize:13,
                boxShadow:isSel?"0 4px 12px rgba(30,58,95,0.3)":"0 1px 4px rgba(0,0,0,0.08)",
                transition:"all 0.15s", textAlign:"center",
              }}>
                <div>{opt.label}</div>
                <div style={{fontSize:10,color:isSel?"rgba(255,255,255,0.65)":"#94A3B8",marginTop:2}}>{fmtDateShort(opt.key)}</div>
                <div style={{fontSize:10,marginTop:3,color:isSel?"#86EFAC":dc===3?"#16A34A":"#94A3B8",fontWeight:600}}>{dc}/3 ca</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {SHIFTS.map(s=>{
          const done=!!forms[s.id].submittedAt;
          const isAct=s.id===activeShift;
          return (
            <button key={s.id} onClick={()=>setActiveShift(s.id)} style={{
              flex:1,padding:"9px 6px",borderRadius:10,border:"none",cursor:"pointer",
              background:isAct?"#1E3A5F":"#F1F5F9",color:isAct?"#fff":"#475569",
              fontWeight:700,fontSize:12,transition:"all 0.15s",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            }}>
              <span>{s.icon} {s.label}</span>
              <Pill done={done} small/>
            </button>
          );
        })}
      </div>

      <div style={{background:"#fff",borderRadius:14,padding:"18px 16px",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",border:"1.5px solid #E2E8F0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#1E3A5F"}}>{shift.icon} {shift.label} · {shift.time}</div>
            <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{fmtDate(selectedDate)}</div>
          </div>
          <Pill done={isDone}/>
        </div>

        {isDone && (
          <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:8,padding:"7px 12px",marginBottom:12,fontSize:12,color:"#15803D"}}>
            ✓ Đã giao ca lúc {cur.submittedAt} — {cur.supervisor}
          </div>
        )}

        {/* Supervisor selector */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>👤 Supervisor trực ca</div>
          <div style={{display:"flex",gap:8}}>
            {SUPERVISOR_LIST.map(name=>{
              const selected=cur.supervisor===name;
              return (
                <button key={name} onClick={()=>!isDone&&setField("supervisor",name)} style={{
                  flex:1,padding:"8px 6px",borderRadius:8,cursor:isDone?"default":"pointer",
                  border:selected?"2px solid #2563EB":"1.5px solid #E2E8F0",
                  background:selected?"#EFF6FF":"#FAFAFA",
                  color:selected?"#1D4ED8":"#64748B",
                  fontWeight:selected?700:500,fontSize:13,transition:"all 0.15s",
                }}>
                  {name}
                  {selected&&<div style={{fontSize:9,color:"#60A5FA",marginTop:1}}>✓ Đang trực</div>}
                </button>
              );
            })}
          </div>
        </div>

        {SECTIONS.map(sec=>(
          <SectionField key={sec.key} sec={sec} value={cur[sec.key]}
            onChange={e=>setField(sec.key,e.target.value)} disabled={isDone}/>
        ))}

        <div style={{marginTop:12}}>
          <ImageUpload images={cur.images}
            onChange={updater=>setField("images",typeof updater==="function"?updater(cur.images):updater)}
            disabled={isDone}/>
        </div>

        {!isDone && (
          <button onClick={handleSubmit} disabled={!cur.supervisor||submitting} style={{
            marginTop:16,width:"100%",padding:"12px",
            background:cur.supervisor&&!submitting?"linear-gradient(135deg,#1E3A5F,#2563EB)":"#E2E8F0",
            color:cur.supervisor&&!submitting?"#fff":"#94A3B8",
            border:"none",borderRadius:10,fontWeight:700,fontSize:14,
            cursor:cur.supervisor&&!submitting?"pointer":"not-allowed",
            boxShadow:cur.supervisor?"0 4px 14px rgba(37,99,235,0.25)":"none",
          }}>
            {submitting?"Đang lưu...":cur.supervisor?`✅ Xác nhận giao ca — ${cur.supervisor}`:"Chọn supervisor để giao ca"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── MANAGER VIEW ──────────────────────────────────────────────────────────────
function ManagerView({ history }) {
  const sortedDays = Object.keys(history).sort((a,b)=>b.localeCompare(a));
  const [selectedDay,setSelectedDay] = useState(sortedDays[0]||todayKey());
  const [detailShift,setDetailShift] = useState(null);

  const dayData = history[selectedDay]||{};
  const doneCount = SHIFTS.filter(s=>dayData[s.id]?.submittedAt).length;
  const totalDays = sortedDays.length;
  const totalShifts = sortedDays.reduce((acc,dk)=>acc+SHIFTS.filter(s=>history[dk]?.[s.id]?.submittedAt).length,0);
  const totalPossible = totalDays*3;

  return (
    <div>
      {/* KPI */}
      <div style={{background:"linear-gradient(135deg,#1E3A5F,#1e4d8c)",borderRadius:14,padding:"16px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{color:"rgba(255,255,255,0.55)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Tổng quan</div>
          <div style={{color:"#fff",fontSize:20,fontWeight:800,marginTop:3}}>{totalShifts}/{totalPossible} ca đã giao</div>
          <div style={{color:"rgba(255,255,255,0.55)",fontSize:11,marginTop:1}}>{totalDays} ngày · {Math.round(totalShifts/Math.max(totalPossible,1)*100)}% hoàn thành</div>
        </div>
        <div style={{width:56,height:56,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",position:"relative"}}>
          <svg width="56" height="56" style={{position:"absolute",top:0,left:0}}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4"/>
            <circle cx="28" cy="28" r="24" fill="none" stroke="#60A5FA" strokeWidth="4"
              strokeDasharray={`${Math.round(totalShifts/Math.max(totalPossible,1)*150.8)} 150.8`}
              strokeLinecap="round" transform="rotate(-90 28 28)"/>
          </svg>
          <span style={{position:"relative",zIndex:1}}>{Math.round(totalShifts/Math.max(totalPossible,1)*100)}%</span>
        </div>
      </div>

      {/* Day selector */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Chọn ngày</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
          {sortedDays.map(dk=>{
            const dd=history[dk]||{};
            const dc=SHIFTS.filter(s=>dd[s.id]?.submittedAt).length;
            const isToday=dk===todayKey();
            const isSel=dk===selectedDay;
            return (
              <button key={dk} onClick={()=>{setSelectedDay(dk);setDetailShift(null);}} style={{
                flex:"0 0 auto",minWidth:64,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",
                background:isSel?"#1E3A5F":"#fff",color:isSel?"#fff":"#475569",
                boxShadow:isSel?"0 4px 12px rgba(30,58,95,0.3)":"0 1px 4px rgba(0,0,0,0.08)",
                fontWeight:isSel?700:500,transition:"all 0.15s",textAlign:"center",
              }}>
                {isToday&&<div style={{fontSize:9,color:isSel?"#93C5FD":"#3B82F6",fontWeight:700,marginBottom:2}}>HÔM NAY</div>}
                <div style={{fontSize:13}}>{fmtDateShort(dk)}</div>
                <div style={{marginTop:4,display:"flex",justifyContent:"center",gap:2}}>
                  {SHIFTS.map(s=>(
                    <div key={s.id} style={{width:7,height:7,borderRadius:"50%",background:dd[s.id]?.submittedAt?"#16A34A":isSel?"rgba(255,255,255,0.25)":"#E2E8F0"}}/>
                  ))}
                </div>
                <div style={{fontSize:10,color:isSel?"rgba(255,255,255,0.6)":"#94A3B8",marginTop:2}}>{dc}/3</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      <div style={{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",border:"1.5px solid #E2E8F0"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:"#1E293B"}}>{fmtDate(selectedDay)}</div>
            <div style={{fontSize:11,color:"#94A3B8"}}>{doneCount}/3 ca đã giao</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            {SHIFTS.map(s=>{
              const done=!!dayData[s.id]?.submittedAt;
              return (
                <div key={s.id} style={{width:32,height:32,borderRadius:8,fontSize:16,background:done?"#DCFCE7":"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {done?"✓":s.icon}
                </div>
              );
            })}
          </div>
        </div>

        {SHIFTS.map(s=>{
          const data=dayData[s.id]||EMPTY_FORM;
          const done=!!data.submittedAt;
          const isOpen=detailShift===s.id;
          return (
            <div key={s.id} style={{borderBottom:"1px solid #F1F5F9"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:isOpen?"#F8FAFC":"#fff"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:8,fontSize:18,background:done?"#F0FDF4":"#FFF5F5",display:"flex",alignItems:"center",justifyContent:"center"}}>{s.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#1E293B"}}>{s.label} · {s.time}</div>
                    <div style={{fontSize:11,color:"#94A3B8"}}>{done?`${data.supervisor||"—"} · ${data.submittedAt}`:"Chưa giao ca"}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Pill done={done} small/>
                  {done&&(
                    <button onClick={()=>setDetailShift(isOpen?null:s.id)} style={{padding:"4px 10px",borderRadius:7,border:"1.5px solid #E2E8F0",background:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",color:"#475569"}}>
                      {isOpen?"Ẩn":"Chi tiết"}
                    </button>
                  )}
                </div>
              </div>

              {done&&isOpen&&(
                <div style={{padding:"12px 16px",borderTop:"1px solid #F1F5F9",background:"#FAFBFC"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px",marginBottom:data.images?.length>0?12:0}}>
                    {SECTIONS.map(sec=>data[sec.key]?(
                      <div key={sec.key}>
                        <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>{sec.icon} {sec.label}</div>
                        <div style={{fontSize:12,color:"#1E293B",lineHeight:1.6}}>{data[sec.key]}</div>
                      </div>
                    ):null)}
                  </div>
                  {data.images?.length>0&&(
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Hình ảnh</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {data.images.map((img,i)=>(
                          <img key={i} src={img.src} alt="" style={{width:64,height:64,objectFit:"cover",borderRadius:6}}/>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!done&&(
                <div style={{padding:"8px 16px 10px",background:"#FFF5F5"}}>
                  <div style={{fontSize:11,color:"#EF4444"}}>⚠ Chưa giao ca</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab] = useState("manager");
  const [history,setHistory] = useState({});
  const [notice,setNotice] = useState(EMPTY_NOTICE);
  const [loading,setLoading] = useState(true);

  // Load all data from Supabase
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load shifts
      const { data:shifts } = await supabase.from("shifts").select("*");
      const hist = {};
      if (shifts) {
        shifts.forEach(row => {
          if (!hist[row.date_key]) hist[row.date_key] = {};
          hist[row.date_key][row.shift_id] = row.data;
        });
      }
      // Ensure today exists
      const dk = todayKey();
      if (!hist[dk]) hist[dk] = { ca1:{...EMPTY_FORM}, ca2:{...EMPTY_FORM}, ca3:{...EMPTY_FORM} };
      setHistory(hist);

      // Load notice
      const { data:notices } = await supabase.from("notices").select("*").limit(1);
      if (notices && notices.length>0) {
        setNotice({ text:notices[0].text||"", images:notices[0].images||[], posted_at:notices[0].posted_at });
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(()=>{ loadData(); },[loadData]);

  // Save shift to Supabase
  const handleShiftSubmit = async (caId, data, dateKey) => {
    const dk = dateKey || todayKey();
    await supabase.from("shifts").upsert(
      { date_key:dk, shift_id:caId, data, updated_at:new Date().toISOString() },
      { onConflict:"date_key,shift_id" }
    );
    setHistory(p=>({ ...p, [dk]:{ ...(p[dk]||{}), [caId]:data } }));
  };

  // Save notice to Supabase
  const handleNoticeSave = async (updated) => {
    const { data:existing } = await supabase.from("notices").select("id").limit(1);
    if (existing && existing.length>0) {
      await supabase.from("notices").update({ text:updated.text, images:updated.images, posted_at:updated.posted_at, updated_at:new Date().toISOString() }).eq("id",existing[0].id);
    } else {
      await supabase.from("notices").insert({ text:updated.text, images:updated.images, posted_at:updated.posted_at });
    }
    setNotice(updated);
  };

  const today = new Date().toLocaleDateString("vi-VN",{weekday:"long",day:"numeric",month:"numeric",year:"numeric"});
  const todayShifts = history[todayKey()] || { ca1:{...EMPTY_FORM}, ca2:{...EMPTY_FORM}, ca3:{...EMPTY_FORM} };

  return (
    <div style={{minHeight:"100vh",background:"#F0F4FA",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`* { box-sizing:border-box; } input,textarea { font-family:inherit; } ::-webkit-scrollbar{height:4px} ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}`}</style>

      {/* Header */}
      <div style={{background:"#0F172A",padding:"0 18px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <span style={{fontSize:20}}>🏭</span>
          <div>
            <div style={{color:"#fff",fontWeight:800,fontSize:14}}>Shift Handover</div>
            <div style={{color:"#475569",fontSize:9,textTransform:"uppercase",letterSpacing:0.8}}>Quản lý giao ca sản xuất</div>
          </div>
        </div>
        <div style={{color:"#475569",fontSize:10}}>{today}</div>
      </div>

      {/* Tab bar */}
      <div style={{background:"#1E293B",padding:"0 18px",display:"flex"}}>
        {[
          {id:"manager",label:"📊 Quản lý",sub:"Production Manager"},
          {id:"supervisor",label:"📋 Giao ca",sub:"Supervisor"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"9px 16px",background:"none",border:"none",cursor:"pointer",
            borderBottom:tab===t.id?"2px solid #3B82F6":"2px solid transparent",
            color:tab===t.id?"#fff":"#94A3B8",
            fontWeight:tab===t.id?700:500,fontSize:12,transition:"all 0.15s",
          }}>
            {t.label}
            <div style={{fontSize:9,color:tab===t.id?"#93C5FD":"#475569"}}>{t.sub}</div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{maxWidth:680,margin:"0 auto",padding:"18px 14px 48px"}}>
        {loading ? (
          <div style={{textAlign:"center",padding:"60px 0",color:"#94A3B8"}}>
            <div style={{fontSize:32,marginBottom:12}}>⏳</div>
            <div style={{fontSize:14}}>Đang tải dữ liệu...</div>
          </div>
        ) : tab==="manager" ? (
          <>
            <NoticeEditor notice={notice} onSave={handleNoticeSave}/>
            <ManagerView history={history}/>
          </>
        ) : (
          <SupervisorView history={history} onSubmit={handleShiftSubmit} notice={notice}/>
        )}
      </div>
    </div>
  );
}
