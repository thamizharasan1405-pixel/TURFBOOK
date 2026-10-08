import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {CalendarDays,CheckCircle2,Clock3,LockKeyhole,RefreshCw} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {getSession} from '../lib/auth';

type Slot={id:string;sport_id:string|null;start_time:string;end_time:string;price:number;status:'AVAILABLE'|'BOOKED'|'TEMPORARILY_LOCKED'|'BLOCKED'};
type Sport={id:string;name:string};
type Lock={lock_id:string;expires_at:string};
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

export default function Booking(){
 const {id}=useParams();const nav=useNavigate();const [searchParams]=useSearchParams();
 const requestedSport=searchParams.get('sport')||'';const requestedTime=searchParams.get('time')||'';
 const rescheduleId=searchParams.get('reschedule');
 const [date,setDate]=useState(()=>{const requested=searchParams.get('date')||'';return /^\d{4}-\d{2}-\d{2}$/.test(requested)&&requested>=todayLocal()?requested:todayLocal()});const [slots,setSlots]=useState<Slot[]>([]);
 const [sports,setSports]=useState<Sport[]>([]);const [sportId,setSportId]=useState('');
 const [selected,setSelected]=useState<Slot|null>(null);const [lock,setLock]=useState<Lock|null>(null);
 const [couponCode,setCouponCode]=useState('');const [coupon,setCoupon]=useState<{discount:number;message:string}|null>(null);
 const [secondsLeft,setSecondsLeft]=useState(0);const [loading,setLoading]=useState(false);
 const [locking,setLocking]=useState(false);const [booking,setBooking]=useState(false);
 const [error,setError]=useState('');const [success,setSuccess]=useState('');

 const loadSlots=useCallback(async(d:string)=>{
   if(!id)return;
   setLoading(true);setError('');
   try{
     const {data,error}=await supabase.rpc('get_slot_states',{p_turf_id:id,p_booking_date:d});
     if(error)throw error;
     setSlots((data||[]) as Slot[]);
   }catch(err){setError(err instanceof Error?err.message:'Unable to load live slot availability.');setSlots([])}
   finally{setLoading(false)}
 },[id]);

 useEffect(()=>{void loadSlots(date)},[date,loadSlots]);
 useEffect(()=>{let active=true;supabase.from('sports').select('id,name').order('name').then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setSports(data||[])});return()=>{active=false}},[]);
 useEffect(()=>{if(!requestedSport||!sports.length)return;const wanted=requestedSport.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');const found=sports.find(item=>item.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')===wanted);if(found)setSportId(found.id)},[requestedSport,sports]);
 useEffect(()=>{if(!id)return;const channel=supabase.channel(`availability:${id}:${date}`).on('postgres_changes',{event:'*',schema:'public',table:'bookings',filter:`turf_id=eq.${id}`},()=>{void loadSlots(date)}).subscribe();const timer=window.setInterval(()=>void loadSlots(date),15000);return()=>{window.clearInterval(timer);void supabase.removeChannel(channel)}},[id,date,loadSlots]);
 useEffect(()=>{if(!lock)return;const update=()=>{const left=Math.max(0,Math.ceil((new Date(lock.expires_at).getTime()-Date.now())/1000));setSecondsLeft(left);if(left===0){setLock(null);setSelected(null);setError('Your 10-minute slot hold expired. Choose the slot again to continue.');void loadSlots(date)}};update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer)},[lock,date,loadSlots]);

 const releaseLock=useCallback(async(current:Lock|null)=>{if(!current)return;const {error}=await supabase.rpc('release_booking_slot',{p_lock_id:current.lock_id});if(error)throw error},[]);
 useEffect(()=>()=>{if(lock)void supabase.rpc('release_booking_slot',{p_lock_id:lock.lock_id})},[lock]);

 const filteredSlots=useMemo(()=>slots.filter(slot=>!sportId||slot.sport_id===sportId),[slots,sportId]);
 const selectedSport=sports.find(s=>s.id===selected?.sport_id)?.name||'Sports venue';

 async function chooseSlot(slot:Slot){
   if(slot.status!=='AVAILABLE'||!id)return;
   setError('');setSuccess('');setCoupon(null);setLocking(true);
   try{
     await releaseLock(lock);
     setLock(null);setSelected(null);
     const {data,error}=await supabase.rpc('lock_booking_slot',{p_turf_id:id,p_booking_date:date,p_slot_id:slot.id});
     if(error)throw error;
     const created=(data||[])[0] as Lock|undefined;
     if(!created)throw new Error('Unable to hold this slot. Please choose it again.');
     setSelected(slot);setLock(created);
     await loadSlots(date);
   }catch(err){
     setError(err instanceof Error?err.message:'This slot is no longer available. Refresh and select another.');
     void loadSlots(date);
   }finally{setLocking(false)}
 }

 async function validateCoupon(){
   setError('');setCoupon(null);
   if(!selected||!couponCode.trim()){setError('Select a slot and enter a coupon code first.');return}
   const {data,error}=await supabase.rpc('validate_coupon',{p_code:couponCode.trim(),p_amount:Number(selected.price)});
   if(error){setError(error.message);return}
   if(!data?.valid){setError(data?.message||'This coupon is not valid for this booking.');return}
   setCoupon({discount:Number(data.discount)||0,message:data.message||'Coupon applied'});
 }

 async function createBooking(){
   setError('');setSuccess('');
   if(!selected||!lock||!id)return;
   setBooking(true);
   try{
     const {data:session,error:sessionError}=await getSession();
     if(sessionError)throw sessionError;
     if(!session.session){nav('/login');return}
     const start=new Date(`1970-01-01T${selected.start_time}`).getTime();
     const end=new Date(`1970-01-01T${selected.end_time}`).getTime();
     const {data,error}=rescheduleId
       ?await supabase.rpc('reschedule_customer_booking',{p_booking_id:rescheduleId,p_lock_id:lock.lock_id,p_coupon_code:coupon?couponCode.trim():null})
       :await supabase.rpc('create_booking_atomic',{
         p_turf_id:id,p_sport_id:selected.sport_id,p_booking_date:date,p_start:selected.start_time,
         p_end:selected.end_time,p_duration:Math.round((end-start)/60000),p_amount:selected.price,
         p_lock_id:lock.lock_id,p_coupon_code:coupon?couponCode.trim():null
       });
     if(error)throw error;
     setLock(null);
     if(rescheduleId){setSuccess('Booking rescheduled successfully.');nav(`/booking/${rescheduleId}`)}
     else nav(`/booking/${data}`);
   }catch(err){setError(err instanceof Error?err.message:'Unable to create booking. Please try another slot.');void loadSlots(date)}
   finally{setBooking(false)}
 }

 const statusStyle:Record<Slot['status'],string>={
   AVAILABLE:'border-white/10 bg-white/[.02] hover:border-lime-400/40',
   BOOKED:'cursor-not-allowed border-red-400/20 bg-red-400/5 opacity-60',
   TEMPORARILY_LOCKED:'cursor-not-allowed border-amber-400/20 bg-amber-400/5 opacity-70',
   BLOCKED:'cursor-not-allowed border-slate-700 bg-slate-800/40 opacity-60'
 };

 return <main className="mx-auto max-w-5xl px-5 py-12">
  <p className="accent text-sm font-bold uppercase tracking-[.2em]">Secure booking</p>
  <h1 className="mt-2 text-4xl font-black">{rescheduleId?'Choose a new game slot.':'Choose your game slot.'}</h1>
  <p className="mt-2 text-slate-400">{rescheduleId?'Your existing booking will move to this slot after the change is confirmed.':'Availability is checked live. Selected slots are held for 10 minutes.'}</p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
   <section className="card p-6">
    <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays size={16} className="accent"/>Booking date</span>
      <input type="date" min={todayLocal()} value={date} onChange={async e=>{try{await releaseLock(lock)}catch(err){setError(err instanceof Error?err.message:'Could not release your previous slot hold.')}setLock(null);setSelected(null);setDate(e.target.value)}} className="rounded-xl border border-white/10 bg-[#0d121b] px-4 py-3"/></label>
    <label className="mt-5 block"><span className="mb-2 block text-sm font-medium">Sport</span>
      <select value={sportId} onChange={e=>{setSportId(e.target.value);setSelected(null);setLock(null)}} className="w-full rounded-xl border border-white/10 bg-[#0d121b] px-4 py-3"><option value="">All sports</option>{sports.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-400"><span>Legend:</span><span className="text-lime-300">Available</span><span className="text-red-300">Booked</span><span className="text-amber-300">Temporarily held</span><span className="text-slate-500">Blocked</span></div>
    <h2 className="mt-5 text-xl font-bold">Live slot availability</h2>
    {loading?<div className="mt-4 py-12 text-center text-slate-500">Checking live availability...</div>:
     filteredSlots.length===0?<div className="mt-4 rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">No slots found for this date and sport.</div>:
     <div className="mt-4 grid gap-3 sm:grid-cols-2">{filteredSlots.map(slot=><button key={slot.id} disabled={slot.status!=='AVAILABLE'||locking||booking} onClick={()=>void chooseSlot(slot)} className={`rounded-xl border p-4 text-left transition ${statusStyle[slot.status]} ${selected?.id===slot.id?'!border-lime-400/60 !bg-lime-400/10':''}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><Clock3 size={16} className="accent"/>{slot.start_time.slice(0,5)} — {slot.end_time.slice(0,5)}</span><b>₹{Number(slot.price).toFixed(0)}</b></div>
      <p className="mt-2 text-xs text-slate-400">{sports.find(s=>s.id===slot.sport_id)?.name||'All sports'} · {slot.status.replaceAll('_',' ')}{requestedTime&&slot.start_time.slice(0,5)===requestedTime&&' · Your preferred time'}</p>
     </button>)}</div>}
    <button onClick={()=>void loadSlots(date)} disabled={loading} className="mt-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><RefreshCw size={14}/>Refresh availability</button>
   </section>
   <aside className="card h-fit p-6"><h2 className="text-xl font-bold">Booking summary</h2>
    {selected&&lock?<><div className="mt-5 space-y-3 text-sm text-slate-400"><p>{date}</p><p>{selectedSport}</p><p>{selected.start_time.slice(0,5)} — {selected.end_time.slice(0,5)}</p><p className="flex justify-between text-white"><span>Base price</span><b>₹{Number(selected.price).toFixed(2)}</b></p><p className="flex justify-between"><span>Coupon discount</span><b>- ₹{Number(coupon?.discount||0).toFixed(2)}</b></p><p className="flex justify-between border-t border-white/10 pt-3 text-base text-white"><span>Due at turf</span><b>₹{(Number(selected.price)-Number(coupon?.discount||0)).toFixed(2)}</b></p></div>
      <div className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200"><LockKeyhole size={16} className="mr-2 inline"/>Slot held for {Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,'0')}</div>
      <div className="mt-4 flex gap-2"><input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCoupon(null)}} placeholder="Coupon code" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0d121b] px-3 py-2"/><button onClick={()=>void validateCoupon()} className="rounded-xl border border-white/10 px-3 text-sm font-semibold">Apply</button></div>
      {coupon&&<p role="status" className="mt-2 text-sm text-lime-300"><CheckCircle2 size={15} className="mr-1 inline"/>{coupon.message}</p>}
      <button disabled={booking||secondsLeft===0} onClick={()=>void createBooking()} className="accent-bg mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold disabled:opacity-50">{booking?(rescheduleId?'Rescheduling…':'Creating booking…'):rescheduleId?'Confirm reschedule':'Continue to payment'}</button>
    </>:<p className="mt-5 text-sm text-slate-500">Choose an available slot to hold it and see the booking summary.</p>}
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
    {success&&<p role="status" className="mt-4 rounded-xl bg-lime-400/10 p-3 text-sm text-lime-300">{success}</p>}
   </aside>
  </div>
 </main>
}
