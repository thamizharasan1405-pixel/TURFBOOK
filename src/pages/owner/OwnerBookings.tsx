import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';

type OwnerBooking={
  id:string;
  turf_id:string;
  booking_date:string;
  start_time:string;
  end_time:string;
  final_amount:number;
  booking_status:string;
  payment_status:string;
  turfs:{name:string;owner_id:string}|null;
};

export default function OwnerBookings(){
 const [rows,setRows]=useState<OwnerBooking[]>([]);
 const [loading,setLoading]=useState(true);
 const [updating,setUpdating]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data:userResult,error:userError}=await supabase.auth.getUser();
   if(userError)throw userError;
   if(!userResult.user)throw new Error('Please sign in to view bookings.');
   const {data,error}=await supabase.from('bookings')
    .select('id,turf_id,booking_date,start_time,end_time,final_amount,booking_status,payment_status,turfs!inner(name,owner_id)')
    .eq('turfs.owner_id',userResult.user.id)
    .order('booking_date',{ascending:false}).order('start_time',{ascending:false});
   if(error)throw error;
   setRows((data||[]) as unknown as OwnerBooking[]);
  }catch(err){setError(err instanceof Error?err.message:'Unable to load bookings.')}
  finally{setLoading(false)}
 },[]);

 useEffect(()=>{void load()},[load]);

 async function complete(id:string){
  setUpdating(id);setError('');setMessage('');
  try{
   const {error}=await supabase.rpc('owner_complete_booking',{p_booking_id:id});
   if(error)throw error;
   setMessage('Booking marked completed.');
   await load();
  }catch(err){setError(err instanceof Error?err.message:'Unable to complete this booking.')}
  finally{setUpdating('')}
 }

 return <div className="space-y-6"><div><p className="text-sm text-slate-400">Owner workspace</p><h1 className="text-3xl font-bold">Bookings</h1></div>
  {error&&<p role="alert" className="rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}<button onClick={()=>void load()} className="ml-3 underline">Try again</button></p>}
  {message&&<p role="status" className="rounded-xl bg-lime-400/10 p-4 text-sm text-lime-200">{message}</p>}
  <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[.03]"><table className="min-w-full text-sm"><thead className="border-b border-white/10 text-left text-slate-400"><tr><th className="p-4">Booking</th><th>Turf</th><th>Date</th><th>Amount</th><th>Payment</th><th>Status</th><th className="p-4">Action</th></tr></thead><tbody>{loading?<tr><td className="p-4" colSpan={7}>Loading...</td></tr>:rows.map(booking=><tr className="border-b border-white/5" key={booking.id}><td className="p-4 font-mono">{booking.id.slice(0,8).toUpperCase()}</td><td>{booking.turfs?.name||'Turf'}</td><td>{booking.booking_date}<br/><span className="text-xs text-slate-500">{booking.start_time.slice(0,5)}–{booking.end_time.slice(0,5)}</span></td><td>₹{Number(booking.final_amount).toLocaleString('en-IN')}</td><td>{booking.payment_status}</td><td><span className="rounded-full bg-white/10 px-2 py-1">{booking.booking_status}</span></td>  <td className="p-4">{['CONFIRMED','RESCHEDULED'].includes(booking.booking_status)&&<button disabled={updating===booking.id} onClick={()=>void complete(booking.id)} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-50">{updating===booking.id?'Updating…':'Complete'}</button>}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="p-8 text-center text-slate-400">No bookings yet.</div>}</div>
 </div>
}
