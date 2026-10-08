import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Plus,Trash2,Clock3} from 'lucide-react';
import {supabase} from '../../lib/supabase';

type Turf={id:string;name:string}; type Slot={id:string;turf_id:string;start_time:string;end_time:string;price:number;active:boolean};
export default function SlotManagement(){
 const [turfs,setTurfs]=useState<Turf[]>([]); const [turfId,setTurfId]=useState(''); const [slots,setSlots]=useState<Slot[]>([]);
 const [start,setStart]=useState('06:00'); const [end,setEnd]=useState('07:00'); const [price,setPrice]=useState('500'); const [msg,setMsg]=useState('');
 async function loadTurfs(){const {data}=await supabase.from('turfs').select('id,name').order('created_at',{ascending:false});const t=(data||[]) as Turf[];setTurfs(t);if(!turfId&&t[0])setTurfId(t[0].id)}
 async function loadSlots(id=turfId){if(!id)return;const {data}=await supabase.from('slot_templates').select('*').eq('turf_id',id).order('start_time');setSlots((data||[]) as Slot[])}
 useEffect(()=>{loadTurfs()},[]); useEffect(()=>{loadSlots()},[turfId]);
 async function add(){setMsg('');if(end<=start){setMsg('End time must be after start time.');return}const {error}=await supabase.from('slot_templates').insert({turf_id:turfId,start_time:start,end_time:end,price:Number(price),active:true});if(error)setMsg(error.message);else{setMsg('Slot added.');loadSlots()}}
 async function remove(id:string){const {error}=await supabase.from('slot_templates').delete().eq('id',id);if(error)setMsg(error.message);else loadSlots()}
 return <main className="mx-auto max-w-6xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="accent text-sm font-bold uppercase tracking-[.2em]">Owner</p><h1 className="mt-2 text-4xl font-black">Slot management</h1><p className="mt-2 text-slate-400">Configure recurring bookable time slots for your turf.</p></div><Link to="/owner" className="btn-secondary">Back to dashboard</Link></div>
 <section className="card mt-8 p-6"><div className="grid gap-4 md:grid-cols-4"><label className="md:col-span-2 text-sm text-slate-400">Turf<select value={turfId} onChange={e=>setTurfId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] p-3 text-white">{turfs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label className="text-sm text-slate-400">Start<input type="time" value={start} onChange={e=>setStart(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] p-3 text-white"/></label>
 <label className="text-sm text-slate-400">End<input type="time" value={end} onChange={e=>setEnd(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] p-3 text-white"/></label>
 <label className="text-sm text-slate-400">Price<input type="number" min="0" value={price} onChange={e=>setPrice(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] p-3 text-white"/></label>
 <button onClick={add} className="accent-bg mt-auto flex items-center justify-center gap-2 rounded-xl p-3 font-bold"><Plus size={18}/> Add slot</button></div>{msg&&<p className="mt-4 text-sm text-slate-300">{msg}</p>}</section>
 <section className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{slots.map(s=><div key={s.id} className="card flex items-center justify-between p-5"><div><p className="flex items-center gap-2 font-bold"><Clock3 size={16} className="accent"/>{s.start_time.slice(0,5)} — {s.end_time.slice(0,5)}</p><p className="mt-2 text-sm text-slate-400">₹{s.price} / slot</p></div><button onClick={()=>remove(s.id)} className="rounded-lg p-2 text-red-300 hover:bg-red-400/10"><Trash2 size={17}/></button></div>)}{slots.length===0&&<div className="card col-span-full p-10 text-center text-slate-500">No slots configured yet.</div>}</section></main>
}