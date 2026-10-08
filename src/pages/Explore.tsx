import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ChevronDown,Heart,MapPin,Search,SlidersHorizontal,Star,X} from 'lucide-react';
import {getTurfs} from '../services/turfs';
import {supabase} from '../lib/supabase';
import type {Turf} from '../types';

const sports=[
  {name:'All sports',slug:'all'},
  {name:'Football',slug:'football'},
  {name:'Cricket',slug:'cricket'},
  {name:'Badminton',slug:'badminton'},
  {name:'Basketball',slug:'basketball'},
  {name:'Tennis',slug:'tennis'},
  {name:'Volleyball',slug:'volleyball'},
  {name:'Box Cricket',slug:'box-cricket'},
];

const sportImages:Record<string,string>={
  football:'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=82',
  cricket:'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=82',
  badminton:'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=82',
  basketball:'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=82',
  tennis:'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=82',
  volleyball:'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=82',
  'box-cricket':'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=82',
};

const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const imageFor=(t:Turf)=>t.cover_image_url || sportImages[slugify(t.turf_type||'football')] || sportImages.football;

export default function Explore(){
  const [searchParams,setSearchParams]=useSearchParams();
  const navigate=useNavigate();
  const [q,setQ]=useState(searchParams.get('location')||searchParams.get('q')||'');
  const [sport,setSport]=useState(searchParams.get('sport')||'all');
  const [mode,setMode]=useState<'all'|'indoor'|'outdoor'>('all');
  const [rating,setRating]=useState('all');
  const [price,setPrice]=useState('all');
  const [sort,setSort]=useState('popular');
  const [facility,setFacility]=useState('all');
  const [distance,setDistance]=useState('all');
  const [coordinates,setCoordinates]=useState<{latitude:number;longitude:number}|null>(null);
  const [distanceError,setDistanceError]=useState('');
  const [favourites,setFavourites]=useState<string[]>([]);
  const [compared,setCompared]=useState<Turf[]>([]);
  const [showFilters,setShowFilters]=useState(false);
  const [turfs,setTurfs]=useState<Turf[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{setQ(searchParams.get('location')||searchParams.get('q')||'');setSport(searchParams.get('sport')||'all')},[searchParams]);
  useEffect(()=>{let active=true;supabase.from('favourites').select('turf_id').then(({data})=>{if(active)setFavourites((data||[]).map(row=>row.turf_id))});return()=>{active=false}},[]);
  useEffect(()=>{
    let cancelled=false;
    const timer=setTimeout(async()=>{
      setLoading(true);setError('');
      try{const data=await getTurfs(q);if(!cancelled)setTurfs(data);}
      catch{if(!cancelled){setTurfs([]);setError('Unable to load live turfs. Please check your Supabase connection.');}}
      finally{if(!cancelled)setLoading(false);}
    },250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[q]);

  const facilityOptions=useMemo(()=>Array.from(new Set(turfs.flatMap(t=>t.facilities||[]))).sort(),[turfs]);
  const distanceKm=(t:Turf)=>{if(!coordinates||t.latitude==null||t.longitude==null)return Number.POSITIVE_INFINITY;const rad=Math.PI/180;const dLat=(Number(t.latitude)-coordinates.latitude)*rad;const dLon=(Number(t.longitude)-coordinates.longitude)*rad;const a=Math.sin(dLat/2)**2+Math.cos(coordinates.latitude*rad)*Math.cos(Number(t.latitude)*rad)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};
  const filtered=useMemo(()=>{
    let list=[...turfs];
    if(sport!=='all'){
      list=list.filter(t=>t.sports?.some(s=>s.slug===sport) || slugify(t.turf_type||'')===sport || slugify(t.name).includes(sport));
    }
    if(mode!=='all')list=list.filter(t=>mode==='indoor'?t.indoor:!t.indoor);
    if(facility!=='all')list=list.filter(t=>t.facilities?.includes(facility));
    if(distance!=='all')list=list.filter(t=>distanceKm(t)<=Number(distance));
    if(rating!=='all')list=list.filter(t=>Number(t.rating||0)>=Number(rating));
    if(price!=='all'){
      if(price==='under-500')list=list.filter(t=>Number(t.starting_price||0)<500);
      if(price==='500-1000')list=list.filter(t=>Number(t.starting_price||0)>=500&&Number(t.starting_price||0)<=1000);
      if(price==='over-1000')list=list.filter(t=>Number(t.starting_price||0)>1000);
    }
    if(sort==='price-low')list.sort((a,b)=>Number(a.starting_price)-Number(b.starting_price));
    if(sort==='price-high')list.sort((a,b)=>Number(b.starting_price)-Number(a.starting_price));
    if(sort==='rating')list.sort((a,b)=>Number(b.rating)-Number(a.rating));
    if(sort==='reviews')list.sort((a,b)=>Number(b.review_count)-Number(a.review_count));
    if(sort==='distance'&&coordinates)list.sort((a,b)=>distanceKm(a)-distanceKm(b));
    return list;
  },[turfs,sport,mode,rating,price,sort,facility,distance,coordinates]);

  const activeFilters=(sport!=='all'?1:0)+(mode!=='all'?1:0)+(rating!=='all'?1:0)+(price!=='all'?1:0)+(facility!=='all'?1:0)+(distance!=='all'?1:0);
  const reset=()=>{setSport('all');setMode('all');setRating('all');setPrice('all');setFacility('all');setDistance('all');setSort('popular');setQ('');setSearchParams({})};
  async function toggleFavourite(turfId:string){const {data:session}=await supabase.auth.getSession();if(!session.session){navigate('/login');return}const {data,error}=await supabase.rpc('toggle_favourite',{p_turf_id:turfId});if(error){setError(error.message);return}setFavourites(current=>data?[...current,turfId]:current.filter(id=>id!==turfId))}
  function addCompare(turf:Turf){setCompared(current=>current.some(item=>item.id===turf.id)?current:current.length<3?[...current,turf]:current)}
  function useLocation(){setDistanceError('');if(!navigator.geolocation){setDistanceError('Location access is not available in this browser.');return}navigator.geolocation.getCurrentPosition(position=>{setCoordinates({latitude:position.coords.latitude,longitude:position.coords.longitude});setSort('distance')},()=>setDistanceError('Allow location access to sort and filter by distance.'),{enableHighAccuracy:false,timeout:10000})}
  function turfUrl(turfId:string){const params=new URLSearchParams();const date=searchParams.get('date');const time=searchParams.get('time');const selectedSport=searchParams.get('sport');if(date)params.set('date',date);if(time)params.set('time',time);if(selectedSport&&selectedSport!=='all')params.set('sport',selectedSport);return `/turf/${turfId}${params.size?`?${params}`:''}`}

  return <main className="mx-auto max-w-7xl px-5 pb-16 pt-9 md:pt-12">
    <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-[#16211d] via-[#101720] to-[#0b0f16] p-6 shadow-glow md:p-9">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl"/>
      <div className="relative max-w-3xl">
        <p className="accent text-xs font-bold uppercase tracking-[.22em]">Explore turfs</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Find a place to play.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">Search venues, compare prices and discover the right court or turf for your next game.</p>
        <div className="mt-7 flex flex-col gap-3 md:flex-row">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#0a0f16]/90 px-4 py-3 shadow-lg">
            <Search size={19} className="shrink-0 text-slate-500"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search turf, area or city..." className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"/>
            {q&&<button onClick={()=>setQ('')} className="text-slate-500 hover:text-white"><X size={17}/></button>}
          </div>
          <button onClick={useLocation} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm font-bold"><MapPin size={17}/>Near me</button>
          <button onClick={()=>setShowFilters(v=>!v)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-bold hover:bg-white/[.07] md:w-auto"><SlidersHorizontal size={17}/> Filters {activeFilters>0&&<span className="rounded-full bg-lime-300 px-2 py-0.5 text-xs text-slate-950">{activeFilters}</span>}</button>
        </div>
        {distanceError&&<p role="alert" className="mt-3 text-sm text-amber-200">{distanceError}</p>}
      </div>
    </section>

    <section className="mt-7">
      <div className="flex items-center justify-between gap-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {sports.map(s=><button key={s.slug} onClick={()=>setSport(s.slug)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${sport===s.slug?'border-lime-300/40 bg-lime-300 text-slate-950':'border-white/10 bg-white/[.03] text-slate-400 hover:text-white'}`}>{s.name}</button>)}
        </div>
      </div>
    </section>

    {showFilters&&<section className="card mt-4 grid gap-4 p-4 md:grid-cols-4">
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Venue</span><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="all">Indoor & Outdoor</option><option value="indoor">Indoor only</option><option value="outdoor">Outdoor only</option></select></label>
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Minimum rating</span><select value={rating} onChange={e=>setRating(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="all">Any rating</option><option value="4">4.0+ stars</option><option value="4.5">4.5+ stars</option></select></label>
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Price / slot</span><select value={price} onChange={e=>setPrice(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="all">Any price</option><option value="under-500">Under ₹500</option><option value="500-1000">₹500 – ₹1,000</option><option value="over-1000">Above ₹1,000</option></select></label>
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Facility</span><select value={facility} onChange={e=>setFacility(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="all">Any facility</option>{facilityOptions.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Distance</span><select value={distance} onChange={e=>{setDistance(e.target.value);if(e.target.value!=='all'&&!coordinates)useLocation()}} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="all">Any distance</option><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="25">Within 25 km</option><option value="50">Within 50 km</option></select></label>
      <label className="text-sm"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Sort by</span><select value={sort} onChange={e=>setSort(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 outline-none"><option value="popular">Popular</option><option value="rating">Highest rated</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="reviews">Most reviewed</option><option value="distance" disabled={!coordinates}>Nearest first (allow location)</option></select></label>
      <div className="md:col-span-4 flex justify-end"><button onClick={reset} className="text-sm font-semibold text-slate-500 hover:text-white">Clear all filters</button></div>
    </section>}

    <section className="mt-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="accent text-xs font-bold uppercase tracking-[.2em]">Live listings</p><h2 className="mt-1 text-2xl font-black md:text-3xl">Available turfs</h2><p className="mt-1 text-sm text-slate-500">{loading?'Checking live venues...':`${filtered.length} venue${filtered.length===1?'':'s'} found`}</p></div>
        <div className="flex items-center gap-2 sm:hidden"><span className="text-xs text-slate-500">Sort</span><select value={sort} onChange={e=>setSort(e.target.value)} className="rounded-lg border border-white/10 bg-[#111722] px-2 py-2 text-xs"><option value="popular">Popular</option><option value="rating">Rating</option><option value="price-low">Price low</option><option value="price-high">Price high</option></select></div>
      </div>

      {error?<div className="card p-10 text-center"><p className="font-bold text-red-300">{error}</p><button onClick={()=>setQ(q+' ')} className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold">Try again</button></div>:loading?<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i=><div key={i} className="card overflow-hidden"><div className="h-56 animate-pulse bg-white/[.04]"/><div className="space-y-3 p-5"><div className="h-5 w-2/3 animate-pulse rounded bg-white/[.05]"/><div className="h-4 w-1/2 animate-pulse rounded bg-white/[.04]"/><div className="h-8 w-full animate-pulse rounded bg-white/[.04]"/></div></div>)}</div>:filtered.length===0?<div className="card p-12 text-center"><Search className="mx-auto text-slate-600" size={34}/><h3 className="mt-4 text-xl font-bold">No matching turfs</h3><p className="mt-2 text-sm text-slate-500">Try another sport, location or price range.</p><button onClick={reset} className="accent-bg mt-5 rounded-xl px-5 py-2.5 text-sm font-bold">Clear filters</button></div>:<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t,index)=><article key={t.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111722] transition duration-300 hover:-translate-y-1 hover:border-lime-300/25 hover:shadow-[0_18px_55px_rgba(0,0,0,.25)]">
          <div className="relative h-56 overflow-hidden bg-slate-900">
            <img src={imageFor(t)} alt={t.name} loading={index<3?'eager':'lazy'} className="h-full w-full object-cover transition duration-700 group-hover:scale-105"/>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"/>
            <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-xs font-bold text-lime-300 backdrop-blur">{t.indoor?'Indoor':'Outdoor'}</span>
            <button onClick={()=>void toggleFavourite(t.id)} aria-label={`${favourites.includes(t.id)?'Remove from':'Add to'} favourites: ${t.name}`} className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/55 p-2 text-white backdrop-blur transition hover:bg-black/75 hover:text-pink-300"><Heart size={17} className={favourites.includes(t.id)?'fill-pink-400 text-pink-400':''}/></button>
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-300">Starting from</p><p className="text-2xl font-black text-white">₹{Number(t.starting_price||0).toFixed(0)}<span className="text-xs font-normal text-slate-300"> / slot</span></p></div><span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur"><Star size={12} className="fill-yellow-300 text-yellow-300"/>{Number(t.rating||0).toFixed(1)} <span className="text-slate-400">({t.review_count||0})</span></span></div>
          </div>
          <div className="p-5">
            <h3 className="line-clamp-1 text-xl font-black">{t.name}</h3>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={14} className="shrink-0"/>{t.area||t.city||'Location available'}</p>
            <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-lg bg-white/[.04] px-2.5 py-1 text-xs text-slate-400">{t.turf_type||'Sports venue'}</span><span className="rounded-lg bg-white/[.04] px-2.5 py-1 text-xs text-slate-400">{t.indoor?'All-weather':'Open-air'}</span></div>
            <div className="mt-5 grid grid-cols-3 gap-2"><Link to={turfUrl(t.id)} className="rounded-xl border border-white/10 py-2.5 text-center text-sm font-bold transition hover:bg-white/[.05]">Details</Link><button onClick={()=>addCompare(t)} disabled={compared.some(item=>item.id===t.id)||compared.length>=3} className="rounded-xl border border-white/10 py-2.5 text-center text-xs font-bold disabled:opacity-40">Compare</button><Link to={`/book/${t.id}${searchParams.get('date')?`?date=${encodeURIComponent(searchParams.get('date')||'')}&sport=${encodeURIComponent(searchParams.get('sport')||'')}&time=${encodeURIComponent(searchParams.get('time')||'')}`:''}`} className="accent-bg rounded-xl py-2.5 text-center text-sm font-bold">Book</Link></div>
          </div>
        </article>)}
      </div>}
    </section>
    {compared.length>0&&<aside className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-5xl rounded-2xl border border-lime-300/20 bg-[#101720] p-4 shadow-2xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>Compare turfs ({compared.length}/3)</b><p className="text-xs text-slate-400">{compared.map(t=>t.name).join(' · ')}</p></div><div className="flex gap-2"><button onClick={()=>setCompared([])} className="rounded-lg border border-white/10 px-3 py-2 text-sm">Clear</button><button onClick={()=>setShowFilters(false)} className="accent-bg rounded-lg px-3 py-2 text-sm font-bold">Compare below</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{compared.map(t=><div key={t.id} className="rounded-xl bg-white/[.04] p-3 text-xs"><b>{t.name}</b><p className="mt-1 text-slate-400">₹{Number(t.starting_price).toFixed(0)} / slot · ★ {Number(t.rating).toFixed(1)}</p><p className="text-slate-400">{t.area||t.city||'Location unavailable'} · {t.indoor?'Indoor':'Outdoor'}</p><button onClick={()=>setCompared(items=>items.filter(item=>item.id!==t.id))} className="mt-1 text-red-300">Remove</button></div>)}</div></aside>}
  </main>;
}
