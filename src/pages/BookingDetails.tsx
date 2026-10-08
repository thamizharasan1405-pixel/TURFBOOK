import {useCallback,useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {CheckCircle2,CreditCard,Download,LoaderCircle,ReceiptText,ShieldCheck,XCircle} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {supabase} from '../lib/supabase';
import {startRazorpayPayment,type RazorpayMethod} from '../lib/razorpay';

const onlineMethods:RazorpayMethod[]=['UPI','CARD','NET_BANKING'];
type Method=RazorpayMethod|'PAY_AT_TURF';
type Booking={id:string;booking_date:string;start_time:string;end_time:string;duration_minutes:number;base_price:number;discount:number;tax:number;final_amount:number;booking_status:string;payment_status:string;turf_id:string;created_at:string;turfs?:{name:string;city:string|null;address:string|null};payments?:{method:string;status:string}[]};
type Invoice={invoice_number:string;issued_at:string;pdf_url:string|null};

export default function BookingDetails(){
  const {id}=useParams();const [booking,setBooking]=useState<Booking|null>(null);
  const [invoice,setInvoice]=useState<Invoice|null>(null);const [method,setMethod]=useState<Method>('PAY_AT_TURF');
  const [loading,setLoading]=useState(true);const [paying,setPaying]=useState(false);
  const [issuingQr,setIssuingQr]=useState(false);const [qrToken,setQrToken]=useState('');
  const [error,setError]=useState('');const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    if(!id)return;
    setLoading(true);setError('');
    const {data,error}=await supabase.from('bookings').select('*,turfs(name,city,address),payments(method,status)')
      .eq('id',id).single();
    if(error)setError(error.message);else setBooking(data as Booking);
    const {data:invoiceData,error:invoiceError}=await supabase.from('invoices')
      .select('invoice_number,issued_at,pdf_url').eq('booking_id',id).maybeSingle();
    if(invoiceError&&invoiceError.code!=='PGRST116')setError(invoiceError.message);
    if(invoiceData)setInvoice(invoiceData);
    setLoading(false);
  },[id]);

  useEffect(()=>{void load()},[load]);

  async function pay(){
    if(!id)return;
    setPaying(true);setMessage('');setError('');
    try{
      if(method==='PAY_AT_TURF'){
        const {error}=await supabase.rpc('create_payment_for_booking',{p_booking_id:id,p_method:method});
        if(error)throw error;
        setMessage('Booking confirmed. Payment is due at the turf.');
        await load();
      }else{
        await startRazorpayPayment({bookingId:id,method,onMessage:setMessage,onError:setError,onSettled:load});
      }
    }catch(err){setError(err instanceof Error?err.message:'Unable to create payment. No payment was taken.')}
    finally{setPaying(false)}
  }

  async function showQr(){
    if(!id)return;
    setIssuingQr(true);setError('');
    try{
      const {data,error}=await supabase.rpc('issue_booking_qr',{p_booking_id:id});
      if(error)throw error;
      if(!data)throw new Error('The QR token could not be generated.');
      setQrToken(data);
    }catch(err){setError(err instanceof Error?err.message:'Unable to generate the secure check-in QR.')}
    finally{setIssuingQr(false)}
  }

  function printInvoice(){window.print()}

  if(loading)return <main className="mx-auto max-w-4xl px-5 py-12 text-slate-500">Loading booking…</main>;
  if(!booking)return <main className="mx-auto max-w-4xl px-5 py-12"><p role="alert" className="text-red-300">{error||'Booking not found.'}</p><Link to="/bookings" className="mt-4 inline-block accent">Back to bookings</Link></main>;

  const confirmed=booking.booking_status==='CONFIRMED'||booking.booking_status==='COMPLETED'
    ||(booking.booking_status==='RESCHEDULED'&&(booking.payment_status==='SUCCESS'
      ||booking.payments?.some(payment=>payment.method==='PAY_AT_TURF'&&payment.status==='PENDING')));
  return <main className="mx-auto max-w-4xl px-5 py-12">
    <Link to="/bookings" className="text-sm accent">← My bookings</Link>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="accent text-sm font-bold uppercase tracking-[.2em]">Booking details</p><h1 className="mt-2 text-4xl font-black">{booking.turfs?.name||'Turf booking'}</h1><p className="mt-2 text-sm text-slate-500">Booking ID · {booking.id}</p></div><span className="rounded-full bg-lime-400/10 px-3 py-1 text-sm font-bold text-lime-300">{booking.booking_status}</span></div>
    {error&&<p role="alert" className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
    {message&&<p role="status" className="mt-5 rounded-xl bg-lime-400/10 p-4 text-sm text-lime-200">{message}</p>}
    <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_330px]">
      <section className="card p-6"><h2 className="text-xl font-bold">Booking summary</h2><div className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><span className="text-slate-500">Date</span><p className="mt-1 font-semibold">{booking.booking_date}</p></div><div><span className="text-slate-500">Time</span><p className="mt-1 font-semibold">{booking.start_time.slice(0,5)} – {booking.end_time.slice(0,5)}</p></div><div><span className="text-slate-500">Duration</span><p className="mt-1 font-semibold">{booking.duration_minutes} minutes</p></div><div><span className="text-slate-500">Location</span><p className="mt-1 font-semibold">{booking.turfs?.address||booking.turfs?.city||'—'}</p></div><div><span className="text-slate-500">Payment</span><p className="mt-1 font-semibold">{booking.payment_status}</p></div></div><div className="mt-8 space-y-3 border-t border-white/10 pt-5 text-sm"><p className="flex justify-between"><span className="text-slate-500">Base amount</span><span>₹{Number(booking.base_price).toFixed(2)}</span></p><p className="flex justify-between"><span className="text-slate-500">Coupon discount</span><span>- ₹{Number(booking.discount).toFixed(2)}</span></p><p className="flex justify-between"><span className="text-slate-500">Tax</span><span>₹{Number(booking.tax).toFixed(2)}</span></p><p className="flex justify-between border-t border-white/10 pt-3 text-base font-bold"><span>Total</span><span>₹{Number(booking.final_amount).toFixed(2)}</span></p></div>
        {confirmed&&<div className="mt-6 border-t border-white/10 pt-5"><h2 className="text-lg font-bold">Secure turf check-in</h2><p className="mt-1 text-sm text-slate-500">Show this one-time QR at the venue for staff verification.</p>{qrToken?<div id="booking-qr" className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-white p-5"><QRCodeSVG value={qrToken} size={220} level="H" includeMargin/><p className="text-xs text-slate-700">Booking {booking.id.slice(0,8).toUpperCase()}</p><button onClick={()=>{const svg=document.querySelector('#booking-qr svg');if(!svg)return;const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`turfbook-${booking.id.slice(0,8)}-checkin.svg`;anchor.click();URL.revokeObjectURL(url)}} className="text-sm font-semibold text-slate-700"><Download size={15} className="mr-1 inline"/>Download QR</button></div>:<button disabled={issuingQr} onClick={()=>void showQr()} className="accent-bg mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold disabled:opacity-50">{issuingQr&&<LoaderCircle size={16} className="animate-spin"/>}Show check-in QR</button>}</div>}
      </section>
      <aside className="card h-fit p-6"><ShieldCheck className="accent" size={25}/><h2 className="mt-3 text-xl font-bold">Payment</h2>{booking.payment_status==='SUCCESS'?<div className="mt-5 rounded-xl bg-lime-400/10 p-4 text-sm text-lime-300"><CheckCircle2 className="mb-2" size={22}/>Payment completed.</div>:booking.booking_status==='CANCELLED'?<div className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-300"><XCircle className="mb-2" size={22}/>This booking is cancelled.</div>:booking.booking_status==='COMPLETED'?<div className="mt-5 rounded-xl bg-white/[.04] p-4 text-sm text-slate-300">Booking completed. Payment status: {booking.payment_status}.</div>:booking.payment_status==='PROCESSING'?<div className="mt-5 rounded-xl bg-amber-400/10 p-4 text-sm text-amber-200">Payment is being confirmed by Razorpay. Do not start another attempt until this status updates.<button onClick={()=>void load()} className="mt-3 block underline">Refresh payment status</button></div>:booking.booking_status==='PENDING'||booking.booking_status==='RESCHEDULED'?<><p className="mt-2 text-sm text-slate-400">Choose a payment method. Online payments open Razorpay Checkout; TURFBOOK never stores card details.</p><div className="mt-5 space-y-2">{onlineMethods.map(item=><button key={item} disabled={paying} onClick={()=>setMethod(item)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${method===item?'border-lime-400/50 bg-lime-400/10':'border-white/10'}`}><span className="flex items-center gap-2"><CreditCard size={16}/>{item.replaceAll('_',' ')}</span></button>)}<button disabled={paying} onClick={()=>setMethod('PAY_AT_TURF')} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm ${method==='PAY_AT_TURF'?'border-lime-400/50 bg-lime-400/10':'border-white/10'}`}><ReceiptText size={16}/>Pay at Turf</button></div><button disabled={paying} onClick={()=>void pay()} className="accent-bg mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold disabled:opacity-50">{paying?<LoaderCircle size={16} className="animate-spin"/>:method==='PAY_AT_TURF'?<ReceiptText size={17}/>:<CreditCard size={17}/>} {method==='PAY_AT_TURF'?'Confirm pay at turf':`Pay with ${method.replaceAll('_',' ')}`}</button></>:<p className="mt-4 text-sm text-slate-400">Payment status: {booking.payment_status}</p>}
        {invoice&&<div className="mt-5 border-t border-white/10 pt-5"><p className="text-sm text-slate-400">Invoice {invoice.invoice_number}</p>{invoice.pdf_url?<a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm accent"><Download size={15}/>Download invoice</a>:<button onClick={printInvoice} className="mt-3 inline-flex items-center gap-2 text-sm accent"><Download size={15}/>Print / Save invoice as PDF</button>}</div>}
      </aside>
    </div>
    <div className="print-only mt-8"><h2>Booking invoice</h2><p>Invoice: {invoice?.invoice_number||booking.id}</p><p>{booking.turfs?.name} · {booking.booking_date} · {booking.start_time.slice(0,5)}–{booking.end_time.slice(0,5)}</p><p>Base ₹{Number(booking.base_price).toFixed(2)} · Discount ₹{Number(booking.discount).toFixed(2)} · Tax ₹{Number(booking.tax).toFixed(2)} · Total ₹{Number(booking.final_amount).toFixed(2)}</p></div>
    <style>{'@media print{body *{visibility:hidden}.print-only,.print-only *{visibility:visible}.print-only{position:absolute;left:0;top:0;width:100%;color:#000}}'}</style>
  </main>
}
