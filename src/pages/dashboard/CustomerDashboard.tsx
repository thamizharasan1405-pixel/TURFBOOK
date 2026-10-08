import {useEffect, useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Heart,
  MapPin,
  Receipt,
  Search,
  Star,
  Ticket,
  Trophy,
  Users,
  Bell,
} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {getSession} from '../../lib/auth';
import type {Turf} from '../../types';

const sports = [
  {name:'Football',slug:'football',image:'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=80'},
  {name:'Cricket',slug:'cricket',image:'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=900&q=80'},
  {name:'Badminton',slug:'badminton',image:'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=900&q=80'},
  {name:'Basketball',slug:'basketball',image:'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=900&q=80'},
  {name:'Tennis',slug:'tennis',image:'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=900&q=80'},
  {name:'Volleyball',slug:'volleyball',image:'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=900&q=80'},
  {name:'Box Cricket',slug:'box-cricket',image:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=900&q=80'},
];

const quickActions = [
  ['My Bookings','Upcoming and previous games','/bookings',CalendarDays],
  ['Favourites','Your saved turfs','/favourites',Heart],
  ['My Teams','Manage your players','/teams',Users],
  ['Tournaments','Register and follow events','/tournaments',Trophy],
  ['Membership','Plans and member benefits','/membership',CheckCircle2],
  ['Notifications','Booking and platform updates','/notifications',Bell],
  ['Profile','Personal details and preferences','/profile',Users],
  ['Support','Get help with a booking','/support',Headphones],
] as const;

type UpcomingBooking = {
  id:string;
  turf_id:string;
  booking_date:string;
  start_time:string;
  end_time:string;
  final_amount:number;
  booking_status:string;
  payment_status:string;
  turfs?: {name:string;city:string|null;cover_image_url:string|null;turf_type:string|null};
  sports?: {name:string}|null;
};

export default function CustomerDashboard(){
  const navigate=useNavigate();
  const [name,setName]=useState('Player');
  const [turfs,setTurfs]=useState<Turf[]>([]);
  const [upcoming,setUpcoming]=useState<UpcomingBooking|null>(null);
  const [upcomingCount,setUpcomingCount]=useState(0);
  const [recentBookings,setRecentBookings]=useState<UpcomingBooking[]>([]);
  const [favoriteTurfs,setFavoriteTurfs]=useState<{id:string;name:string;city:string|null;cover_image_url:string|null;rating:number;starting_price:number}[]>([]);
  const [recentTurfs,setRecentTurfs]=useState<{id:string;name:string;city:string|null;cover_image_url:string|null;rating:number;starting_price:number}[]>([]);
  const [offers,setOffers]=useState<{id:string;code:string;description:string|null;discount_type:string;discount_value:number;expires_at:string}[]>([]);
  const [tournaments,setTournaments]=useState<{id:string;name:string;start_date:string;entry_fee:number;registration_deadline:string|null}[]>([]);
  const [favouriteCount,setFavouriteCount]=useState(0);
  const [unreadCount,setUnreadCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [location,setLocation]=useState('');
  const [sport,setSport]=useState('');
  const [searchDate,setSearchDate]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
  const [preferredTime,setPreferredTime]=useState('');
  const [searchError,setSearchError]=useState('');

  useEffect(()=>{
    let active=true;
    async function load(){
      setLoading(true);
      setError('');
      try{
        const {data:sessionData,error:sessionError}=await getSession();
        if(sessionError)throw sessionError;
        const user=sessionData.session?.user;
        if(!user)throw new Error('Your session has expired. Please sign in again.');

        const now=new Date();
        const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
        const currentTime=[String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0'),String(now.getSeconds()).padStart(2,'0')].join(':');
        const upcomingStatuses=['PENDING','CONFIRMED','RESCHEDULED'];
        const futureBookingFilter=`booking_date.gt.${today},and(booking_date.eq.${today},start_time.gte.${currentTime})`;
        const [profileRes,turfRes,bookingRes,bookingCountRes,favouriteRes,notificationRes,recentRes,favoriteTurfsRes,recentTurfsRes,offersRes,tournamentRes]=await Promise.all([
          supabase.from('profiles').select('full_name').eq('id',user.id).maybeSingle(),
          supabase.from('turfs').select('id,name,description,area,city,cover_image_url,rating,review_count,starting_price,indoor,status,approval_status').eq('status','ACTIVE').eq('approval_status','APPROVED').order('rating',{ascending:false}).limit(6),
          supabase.from('bookings').select('id,turf_id,booking_date,start_time,end_time,final_amount,booking_status,payment_status,turfs(name,city,cover_image_url,turf_type),sports(name)').eq('customer_id',user.id).or(futureBookingFilter).in('booking_status',upcomingStatuses).order('booking_date',{ascending:true}).order('start_time',{ascending:true}).limit(1).maybeSingle(),
          supabase.from('bookings').select('id',{count:'exact',head:true}).eq('customer_id',user.id).or(futureBookingFilter).in('booking_status',upcomingStatuses),
          supabase.from('favourites').select('turf_id',{count:'exact',head:true}).eq('user_id',user.id),
          supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null),
          supabase.from('bookings').select('id,turf_id,booking_date,start_time,end_time,final_amount,booking_status,payment_status,turfs(name,city,cover_image_url,turf_type),sports(name)').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(3),
          supabase.from('favourites').select('turfs(id,name,city,cover_image_url,rating,starting_price)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(4),
          supabase.from('customer_turf_views').select('last_viewed_at,turfs(id,name,city,cover_image_url,rating,starting_price)').eq('user_id',user.id).order('last_viewed_at',{ascending:false}).limit(4),
          supabase.from('coupons').select('id,code,description,discount_type,discount_value,expires_at').eq('active',true).lte('start_at',new Date().toISOString()).gt('expires_at',new Date().toISOString()).order('expires_at').limit(4),
          supabase.from('tournaments').select('id,name,start_date,entry_fee,registration_deadline').gte('start_date',today).neq('status','DRAFT').order('start_date').limit(3),
        ]);
        const queryError=profileRes.error||turfRes.error||bookingRes.error||bookingCountRes.error||favouriteRes.error||notificationRes.error||recentRes.error||favoriteTurfsRes.error||recentTurfsRes.error||offersRes.error||tournamentRes.error;
        if(queryError)throw queryError;
        if(!active)return;
        if(profileRes.data?.full_name)setName(profileRes.data.full_name.split(' ')[0]);
        setTurfs(turfRes.data as Turf[]);
        setUpcoming(bookingRes.data as unknown as UpcomingBooking|null);
        setUpcomingCount(bookingCountRes.count??0);
        setFavouriteCount(favouriteRes.count??0);
        setUnreadCount(notificationRes.count??0);
        setRecentBookings((recentRes.data||[]) as unknown as UpcomingBooking[]);
        setFavoriteTurfs((favoriteTurfsRes.data||[]).flatMap(row=>row.turfs?[row.turfs as unknown as typeof favoriteTurfs[number]]:[]));
        setRecentTurfs((recentTurfsRes.data||[]).flatMap(row=>row.turfs?[row.turfs as unknown as typeof recentTurfs[number]]:[]));
        setOffers((offersRes.data||[]) as typeof offers);
        setTournaments((tournamentRes.data||[]) as typeof tournaments);
      }catch(err){
        if(active)setError(err instanceof Error?err.message:'Unable to load your dashboard. Please try again.');
      }finally{
        if(active)setLoading(false);
      }
    }
    void load();
    return()=>{active=false};
  },[reload]);

  function searchTurfs(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setSearchError('');
    if(!searchDate){setSearchError('Choose a date to search available turfs.');return}
    const params=new URLSearchParams();
    if(location.trim())params.set('location',location.trim());
    if(sport)params.set('sport',sport);
    params.set('date',searchDate);
    if(preferredTime)params.set('time',preferredTime);
    navigate(`/explore?${params.toString()}`);
  }

  return <main className="mx-auto max-w-7xl px-5 pb-16 pt-8 md:pt-12">
    <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-[#16211d] via-[#101720] to-[#0b0f16] p-6 shadow-glow md:p-9">
      <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-lime-400/10 blur-3xl"/>
      <div className="absolute bottom-0 right-0 h-40 w-72 bg-[radial-gradient(circle_at_center,rgba(124,255,107,.14),transparent_65%)]"/>
      <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.18em] text-lime-300">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300"/> Customer dashboard
          </div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">Hey {name},<br/><span className="accent">ready to play?</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">Discover nearby sports, compare real turf availability and lock your next game in just a few taps.</p>
        </div>
        <Link to="/explore" className="accent-bg inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold shadow-[0_12px_35px_rgba(124,255,107,.16)]">Book a turf <ArrowRight size={18}/></Link>
      </div>
    </section>

    <section className="card mt-5 p-5 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.2em]">Find your next game</p><h2 className="mt-1 text-2xl font-black">Search turfs & live slots</h2></div><Link to="/explore" className="text-sm font-semibold text-slate-400 hover:text-white">Advanced filters →</Link></div>
      <form onSubmit={searchTurfs} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-400">Location<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, area or turf" className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] px-3 py-3 text-sm text-white outline-none focus:border-lime-400/50"/></label>
        <label className="text-xs font-semibold text-slate-400">Sport<select value={sport} onChange={e=>setSport(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] px-3 py-3 text-sm text-white"><option value="">Any sport</option>{sports.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-400">Date<input type="date" min={searchDate} value={searchDate} onChange={e=>setSearchDate(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] px-3 py-3 text-sm text-white"/></label>
        <label className="text-xs font-semibold text-slate-400">Preferred time<input type="time" value={preferredTime} onChange={e=>setPreferredTime(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d121b] px-3 py-3 text-sm text-white"/></label>
        <button className="accent-bg inline-flex items-center justify-center gap-2 self-end rounded-xl px-5 py-3 font-bold"><Search size={17}/>Search</button>
      </form>
      {searchError&&<p role="alert" className="mt-3 text-sm text-red-300">{searchError}</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><Link to="/" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">Home</Link><Link to="/explore" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">Explore turfs</Link><Link to="/bookings" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">My bookings</Link><Link to="/profile" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">Profile & settings</Link><Link to="/support" className="rounded-lg border border-white/10 px-3 py-2 text-slate-400 hover:text-white">Support</Link></div>
    </section>

    {error&&<div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"><span>Could not load dashboard data: {error}</span><button onClick={()=>setReload(value=>value+1)} className="rounded-lg border border-red-300/20 px-3 py-2 font-semibold hover:bg-red-300/10">Try again</button></div>}

    <section className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="card flex items-center gap-4 p-4"><div className="rounded-xl bg-lime-400/10 p-3 text-lime-300"><CalendarDays size={20}/></div><div><p className="text-xs uppercase tracking-wider text-slate-500">Upcoming</p><b className="text-xl">{loading?'—':upcomingCount}</b><p className="text-xs text-slate-500">scheduled {upcomingCount===1?'game':'games'}</p></div></div>
      <Link to="/favourites" className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5"><div className="rounded-xl bg-pink-400/10 p-3 text-pink-300"><Heart size={20}/></div><div><p className="text-xs uppercase tracking-wider text-slate-500">Favourites</p><b className="text-xl">{favouriteCount}</b><p className="text-xs text-slate-500">saved turfs</p></div></Link>
      <Link to="/notifications" className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5"><div className="rounded-xl bg-blue-400/10 p-3 text-blue-300"><Bell size={20}/></div><div><p className="text-xs uppercase tracking-wider text-slate-500">Notifications</p><b className="text-xl">{unreadCount}</b><p className="text-xs text-slate-500">unread updates</p></div></Link>
    </section>

    <section className="mt-10">
      <div className="mb-5 flex items-end justify-between gap-4"><div><p className="accent text-xs font-bold uppercase tracking-[.2em]">Choose your game</p><h2 className="mt-1 text-2xl font-black md:text-3xl">Play by sport</h2></div><Link to="/explore" className="hidden items-center gap-1 text-sm font-semibold text-slate-400 hover:text-white sm:flex">View all turfs <ChevronRight size={16}/></Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {sports.map(s=><Link key={s.slug} to="/explore" className="group relative h-36 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 sm:h-40">
          <img src={s.image} alt={s.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-110"/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"/>
          <div className="absolute inset-x-0 bottom-0 p-3"><p className="font-bold text-white">{s.name}</p><p className="mt-0.5 text-[11px] text-slate-300">Explore venues</p></div>
        </Link>)}
      </div>
    </section>

    <section className="mt-11">
      <div className="mb-5 flex items-end justify-between gap-4"><div><p className="accent text-xs font-bold uppercase tracking-[.2em]">Handpicked for you</p><h2 className="mt-1 text-2xl font-black md:text-3xl">Popular turfs</h2></div><Link to="/explore" className="flex items-center gap-1 text-sm font-semibold text-slate-400 hover:text-white">Explore all <ChevronRight size={16}/></Link></div>
      {loading ? <div className="card p-10 text-center text-slate-500">Loading live turf data...</div> : error ? <div className="card p-10 text-center text-slate-400">Turf listings are unavailable right now. Please try again.</div> : turfs.length===0 ? <div className="card p-10 text-center"><Trophy className="mx-auto text-slate-600"/><p className="mt-3 text-slate-400">No approved turfs are available yet.</p><Link to="/explore" className="mt-4 inline-flex accent">Open Explore →</Link></div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{turfs.map(t=><Link key={t.id} to={`/turf/${t.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111722] transition hover:-translate-y-1 hover:border-lime-300/25">
        <div className="relative h-48 overflow-hidden bg-slate-900">{t.cover_image_url ? <img src={t.cover_image_url} alt={t.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="grid h-full place-items-center text-slate-600"><Trophy size={38}/></div>}<div className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-bold text-lime-300 backdrop-blur">{t.indoor ? 'Indoor' : 'Outdoor'}</div><div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-bold text-white backdrop-blur"><Star size={12} className="fill-yellow-300 text-yellow-300"/>{Number(t.rating||0).toFixed(1)}</div></div>
        <div className="p-4"><h3 className="text-lg font-bold group-hover:text-lime-300">{t.name}</h3><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={14}/>{t.area || t.city || 'Location available'}</p><div className="mt-4 flex items-end justify-between"><div><p className="text-[11px] uppercase tracking-wider text-slate-500">Starting from</p><b className="text-lg">₹{Number(t.starting_price||0).toFixed(0)}</b><span className="text-xs text-slate-500"> / slot</span></div><span className="flex items-center gap-1 text-sm font-semibold text-lime-300">View turf <ChevronRight size={15}/></span></div></div>
      </Link>)}</div>}
    </section>

    <section className="mt-11 grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Your picks</p><h2 className="mt-1 text-xl font-black">Favourite turfs</h2></div><Link to="/favourites" className="text-sm text-slate-400">View all →</Link></div>
        {favoriteTurfs.length===0?<p className="mt-5 text-sm text-slate-500">Your saved turfs will appear here.</p>:<div className="mt-4 space-y-2">{favoriteTurfs.map(t=><div key={t.id} className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3">{t.cover_image_url?<img src={t.cover_image_url} alt="" className="h-14 w-16 rounded-lg object-cover"/>:<div className="grid h-14 w-16 place-items-center rounded-lg bg-white/5"><Trophy size={18} className="text-slate-500"/></div>}<div className="min-w-0 flex-1"><b className="block truncate text-sm">{t.name}</b><p className="text-xs text-slate-500">{t.city||'Location'} · ₹{Number(t.starting_price).toFixed(0)} · ★ {Number(t.rating).toFixed(1)}</p></div><Link to={`/book/${t.id}`} className="accent text-xs font-bold">Book</Link></div>)}</div>}
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Play together</p><h2 className="mt-1 text-xl font-black">Upcoming tournaments</h2></div><Link to="/tournaments" className="text-sm text-slate-400">View all →</Link></div>
        {tournaments.length===0?<p className="mt-5 text-sm text-slate-500">No upcoming tournaments are open for registration.</p>:<div className="mt-4 space-y-2">{tournaments.map(t=><Link key={t.id} to="/tournaments" className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3"><Trophy className="accent" size={19}/><span className="min-w-0 flex-1"><b className="block truncate text-sm">{t.name}</b><small className="text-slate-500">{t.start_date} · Entry ₹{Number(t.entry_fee||0).toFixed(0)}{t.registration_deadline?` · Register by ${t.registration_deadline}`:''}</small></span><ChevronRight size={16}/></Link>)}</div>}
      </div>
    </section>

    {recentTurfs.length>0&&<section className="mt-8 card p-5"><div className="flex items-center justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Pick up where you left</p><h2 className="mt-1 text-xl font-black">Recently viewed turfs</h2></div><Link to="/explore" className="text-sm text-slate-400">Explore all →</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{recentTurfs.map(turf=><article key={turf.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.02]"><Link to={`/turf/${turf.id}`} className="block h-28 bg-slate-900">{turf.cover_image_url&&<img src={turf.cover_image_url} alt={turf.name} className="h-full w-full object-cover"/>}</Link><div className="p-3"><b className="block truncate text-sm">{turf.name}</b><p className="mt-1 text-xs text-slate-500">{turf.city||'Location'} · ₹{Number(turf.starting_price).toFixed(0)}</p><Link to={`/book/${turf.id}`} className="mt-2 inline-block text-xs font-bold accent">Quick rebook →</Link></div></article>)}</div></section>}

    <section className="mt-6 card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Live offers</p><h2 className="mt-1 text-xl font-black">Active coupons</h2></div><Link to="/coupons" className="text-sm text-slate-400">Check a coupon →</Link></div>
      {offers.length===0?<p className="mt-4 text-sm text-slate-500">No active offers are available right now.</p>:<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{offers.map(offer=><article key={offer.id} className="rounded-xl border border-lime-300/15 bg-lime-300/[.04] p-4"><Ticket className="accent" size={18}/><b className="mt-2 block text-lg">{offer.code}</b><p className="text-sm text-slate-300">{offer.description||`${offer.discount_type==='PERCENTAGE'?`${offer.discount_value}%`:`₹${offer.discount_value}`} off`}</p><p className="mt-2 text-xs text-slate-500">Valid until {new Date(offer.expires_at).toLocaleDateString()}</p></article>)}</div>}
    </section>

    <section className="mt-11 grid gap-5 lg:grid-cols-[1.5fr_.8fr]">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 p-5"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Next on your calendar</p><h2 className="mt-1 text-xl font-black">Upcoming booking</h2></div><Link to="/bookings" className="text-sm text-slate-400 hover:text-white">All bookings →</Link></div>
        {upcoming ? <Link to={`/booking/${upcoming.id}`} className="group grid md:grid-cols-[180px_1fr]">
          <div className="h-44 bg-slate-900 md:h-full">{upcoming.turfs?.cover_image_url&&<img src={upcoming.turfs.cover_image_url} alt={upcoming.turfs.name} className="h-full w-full object-cover transition group-hover:scale-105"/>}</div>
          <div className="p-5 md:p-6"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-lime-400/10 px-2.5 py-1 text-xs font-bold text-lime-300">{upcoming.booking_status}</span><span className="text-xs text-slate-500">Payment {upcoming.payment_status}</span></div><h3 className="mt-4 text-2xl font-black">{upcoming.turfs?.name || 'Turf booking'}</h3><div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-3"><span className="flex items-center gap-2"><CalendarDays size={15} className="accent"/>{upcoming.booking_date}</span><span className="flex items-center gap-2"><Clock3 size={15} className="accent"/>{upcoming.start_time.slice(0,5)} – {upcoming.end_time.slice(0,5)}</span><span className="flex items-center gap-2"><MapPin size={15} className="accent"/>{upcoming.turfs?.city || 'Location'}</span></div><div className="mt-5 flex items-center justify-between"><b className="text-lg">₹{Number(upcoming.final_amount||0).toFixed(0)}</b><span className="flex items-center gap-1 text-sm font-semibold text-lime-300">View booking <ArrowRight size={15}/></span></div></div>
        </Link> : <div className="p-8 text-center"><CalendarDays className="mx-auto text-slate-600" size={34}/><h3 className="mt-3 font-bold">No upcoming games yet</h3><p className="mt-1 text-sm text-slate-500">Pick a sport above and book your next slot.</p><Link to="/explore" className="mt-4 inline-flex accent text-sm font-semibold">Explore available turfs →</Link></div>}
      </div>

      <div className="card p-5">
        <p className="accent text-xs font-bold uppercase tracking-[.18em]">Quick access</p>
        <h2 className="mt-1 text-xl font-black">Manage your account</h2>
        <div className="mt-5 space-y-2">{quickActions.map(([title,desc,to,Icon])=><Link key={title} to={to} className="group flex items-center gap-3 rounded-xl border border-white/7 bg-white/[.02] p-3 transition hover:border-lime-300/20 hover:bg-white/[.04]"><span className="rounded-lg bg-lime-400/10 p-2 text-lime-300"><Icon size={17}/></span><span className="min-w-0 flex-1"><b className="block text-sm">{title}</b><small className="block truncate text-xs text-slate-500">{desc}</small></span><ArrowRight size={15} className="text-slate-600 transition group-hover:text-lime-300"/></Link>)}</div>
        <Link to="/tournaments" className="mt-4 flex items-center gap-3 rounded-xl border border-lime-300/10 bg-lime-300/5 p-3"><span className="rounded-lg bg-lime-300/10 p-2 text-lime-300"><Trophy size={17}/></span><span className="flex-1"><b className="block text-sm">Tournaments</b><small className="text-xs text-slate-500">Find upcoming competitions</small></span><ChevronRight size={16} className="text-slate-500"/></Link>
      </div>
    </section>

    <section className="mt-8 card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="accent text-xs font-bold uppercase tracking-[.18em]">Your activity</p><h2 className="mt-1 text-xl font-black">Recent bookings</h2></div><Link to="/bookings" className="text-sm text-slate-400">All bookings →</Link></div>
      {loading?<p className="mt-4 text-sm text-slate-500">Loading booking history…</p>:recentBookings.length===0?<p className="mt-4 text-sm text-slate-500">Your completed and previous bookings will appear here.</p>:<div className="mt-4 divide-y divide-white/5">{recentBookings.map(booking=><div key={booking.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><b className="block truncate text-sm">{booking.turfs?.name||'Turf booking'}</b><p className="text-xs text-slate-500">{booking.booking_date} · {booking.start_time.slice(0,5)} · {booking.booking_status} · ₹{Number(booking.final_amount).toFixed(0)}</p></div><Link to={`/booking/${booking.id}`} className="text-xs font-semibold text-slate-300">Details</Link><Link to={`/book/${booking.turf_id}`} className="text-xs font-bold accent">Rebook</Link></div>)}</div>}
    </section>

    <section className="mt-10 rounded-2xl border border-lime-300/10 bg-gradient-to-r from-lime-300/10 to-transparent p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime-300">Game day made simple</p><h2 className="mt-1 text-xl font-black">See a turf. Pick a slot. Play.</h2><p className="mt-1 text-sm text-slate-400">Real turf listings, booking status and receipts — all in one place.</p></div><Link to="/explore" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900">Explore turfs <ArrowRight size={16}/></Link></div>
    </section>
  </main>
}
