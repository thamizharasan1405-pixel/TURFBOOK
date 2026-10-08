import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays,ChevronRight,Clock3,MapPin,XCircle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {getSession} from '../lib/auth';
import {ReviewForm} from './Engagement';

type Refund={id:string;amount:number;status:string;requested_at:string;completed_at:string|null};
type Booking={id:string;turf_id:string;booking_date:string;start_time:string;end_time:string;final_amount:number;booking_status:string;payment_status:string;turfs:{name:string;city:string|null;cover_image_url:string|null}|null;refunds:Refund[]};
type Tab='UPCOMING'|'COMPLETED'|'CANCELLED'|'RESCHEDULED';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

export default function Bookings(){
  const [rows,setRows]=useState<Booking[]>([]);const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<Tab>('UPCOMING');const [message,setMessage]=useState('');
  const [error,setError]=useState('');const [cancelling,setCancelling]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const {data:session,error:sessionError}=await getSession();if(sessionError)throw sessionError;
      if(!session.session)throw new Error('Please sign in to view your bookings.');
      const {data,error}=await supabase.from('bookings')
        .select('id,turf_id,booking_date,start_time,end_time,final_amount,booking_status,payment_status,turfs(name,city,cover_image_url),refunds(id,amount,status,requested_at,completed_at)')
        .eq('customer_id',session.session.user.id).order('booking_date',{ascending:false}).order('start_time',{ascending:false});
      if(error)throw error;
      setRows((data||[]) as unknown as Booking[]);
    }catch(err){setError(err instanceof Error?err.message:'Unable to load your bookings.')}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void load()},[load]);

  const filtered=useMemo(()=>rows.filter(booking=>{
    if(tab==='COMPLETED')return booking.booking_status==='COMPLETED';
    if(tab==='CANCELLED')return booking.booking_status==='CANCELLED';
    if(tab==='RESCHEDULED')return booking.booking_status==='RESCHEDULED';
    return ['PENDING','CONFIRMED','RESCHEDULED'].includes(booking.booking_status)&&booking.booking_date>=today();
  }),[rows,tab]);

  async function cancel(id:string){
    if(!window.confirm('Cancel this booking? Refund eligibility is calculated using the current cancellation policy.'))return;
    setCancelling(id);setMessage('');setError('');
    try{const {data,error}=await supabase.rpc('cancel_booking',{p_booking_id:id,p_reason:'Customer cancellation'});if(error)throw error;setMessage(`Booking cancelled. Calculated refund: ₹${Number(data?.refund_amount||0).toFixed(2)} (${data?.refund_policy||'policy applied'}).`);await load()}
    catch(err){setError(err instanceof Error?err.message:'Unable to cancel booking.')}
    finally{setCancelling('')}
  }

  const tabs:Tab[]=['UPCOMING','COMPLETED','CANCELLED','RESCHEDULED'];
  return <main className="mx-auto max-w-6xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="accent text-sm font-bold uppercase tracking-[.2em]">My bookings</p><h1 className="mt-2 text-4xl font-black">Your games, all in one place.</h1></div><Link to="/explore" className="accent-bg rounded-xl px-5 py-3 font-bold">Book a turf</Link></div>
    <div role="tablist" aria-label="Booking status" className="mt-7 flex gap-2 overflow-x-auto">{tabs.map(value=><button role="tab" aria-selected={tab===value} key={value} onClick={()=>setTab(value)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab===value?'border-lime-300/40 bg-lime-300 text-slate-950':'border-white/10 text-slate-400'}`}>{value.charAt(0)+value.slice(1).toLowerCase()}</button>)}</div>
    {message&&<div role="status" className="mt-5 rounded-xl border border-lime-300/15 bg-lime-300/5 p-4 text-sm text-lime-200">{message}</div>}{error&&<div role="alert" className="mt-5 rounded-xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-red-200">{error}<button onClick={()=>void load()} className="ml-3 underline">Try again</button></div>}
    {loading?<div className="card mt-8 p-10 text-center text-slate-500">Loading bookings…</div>:filtered.length===0?<div className="card mt-8 p-12 text-center"><CalendarDays className="mx-auto accent" size={34}/><h2 className="mt-4 text-xl font-bold">No {tab.toLowerCase()} bookings</h2><p className="mt-2 text-slate-500">{tab==='UPCOMING'?'Find a turf and reserve your next game.':'Bookings in this category will appear here.'}</p><Link to="/explore" className="mt-4 inline-block accent">Explore turfs →</Link></div>:<div className="mt-8 space-y-4">{filtered.map(booking=><article key={booking.id} className="card overflow-hidden"><div className="grid md:grid-cols-[150px_1fr_auto] md:items-center"><div className="h-36 bg-slate-900">{booking.turfs?.cover_image_url&&<img src={booking.turfs.cover_image_url} alt={booking.turfs.name||'Booked turf'} className="h-full w-full object-cover"/>}</div><div className="p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{booking.turfs?.name||'Turf booking'}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${booking.booking_status==='CANCELLED'?'bg-red-400/10 text-red-300':'bg-lime-400/10 text-lime-300'}`}>{booking.booking_status}</span></div><div className="mt-3 grid gap-2 text-sm text-slate-400 sm:grid-cols-3"><span className="flex items-center gap-2"><CalendarDays size={15}/>{booking.booking_date}</span><span className="flex items-center gap-2"><Clock3 size={15}/>{booking.start_time.slice(0,5)} – {booking.end_time.slice(0,5)}</span><span className="flex items-center gap-2"><MapPin size={15}/>{booking.turfs?.city||'Location'}</span></div><p className="mt-3 text-sm text-slate-500">Payment: <b className="text-slate-300">{booking.payment_status}</b></p>{booking.refunds.map(refund=><p key={refund.id} className="mt-2 text-sm text-amber-200">Refund ₹{Number(refund.amount).toFixed(2)} · {refund.status}{refund.completed_at?` · ${new Date(refund.completed_at).toLocaleDateString()}`:''}</p>)}</div><div className="flex flex-col gap-2 p-5 md:items-end"><b className="text-lg">₹{Number(booking.final_amount).toFixed(2)}</b><Link to={`/booking/${booking.id}`} className="flex items-center gap-1 text-sm accent">Details & QR <ChevronRight size={15}/></Link><Link to={`/book/${booking.turf_id}`} className="text-sm text-slate-300">Rebook this turf</Link>{['CONFIRMED','PENDING','RESCHEDULED'].includes(booking.booking_status)&&booking.booking_date>=today()&&<><Link to={`/book/${booking.turf_id}?reschedule=${booking.id}`} className="text-sm text-slate-300">Reschedule</Link><button onClick={()=>void cancel(booking.id)} disabled={cancelling===booking.id} className="flex items-center gap-1 text-sm text-red-300 disabled:opacity-50"><XCircle size={15}/>{cancelling===booking.id?'Cancelling…':'Cancel booking'}</button></>}</div></div>{booking.booking_status==='COMPLETED'&&<div className="border-t border-white/5 p-5"><ReviewForm bookingId={booking.id} turfId={booking.turf_id}/></div>}</article>)}</div>}
  </main>
}
