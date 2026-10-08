import {useCallback,useEffect,useState} from 'react';
import {Link,useParams,useSearchParams,useNavigate} from 'react-router-dom';
import {ArrowLeft,CalendarDays,Check,Clock3,Heart,MapPin,Share2,Star,Waypoints} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {getSession} from '../../lib/auth';

type TurfDetailsData={
  id:string;name:string;description:string|null;address:string|null;area:string|null;city:string|null;
  latitude:number|null;longitude:number|null;cover_image_url:string|null;rating:number;review_count:number;
  starting_price:number;opening_time:string;closing_time:string;turf_type:string;indoor:boolean;
  rules:string|null;cancellation_policy:Record<string,unknown>|null;
  turf_images:{url:string;sort_order:number;is_primary:boolean}[];
  turf_sports:{sports:{name:string;slug:string}|null}[];
  turf_facilities:{facilities:{name:string}|null}[];
  reviews:{rating:number;review_text:string|null;created_at:string;approved:boolean}[];
};

export default function TurfDetails(){
  const {id}=useParams();const [params]=useSearchParams();const navigate=useNavigate();
  const [turf,setTurf]=useState<TurfDetailsData|null>(null);const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');const [favorite,setFavorite]=useState(false);
  const [savingFavorite,setSavingFavorite]=useState(false);const [copied,setCopied]=useState(false);
  const [compare,setCompare]=useState<TurfDetailsData[]>([]);

  const load=useCallback(async()=>{
    if(!id)return;
    setLoading(true);setError('');
    try{
      const {data,error}=await supabase.from('turfs')
        .select('*,turf_images(url,sort_order,is_primary),turf_sports(sports(name,slug)),turf_facilities(facilities(name)),reviews(rating,review_text,created_at,approved)')
        .eq('id',id).eq('status','ACTIVE').eq('approval_status','APPROVED').single();
      if(error)throw error;
      setTurf(data as unknown as TurfDetailsData);
    }catch(err){setError(err instanceof Error?err.message:'Unable to load turf details.')}
    finally{setLoading(false)}
  },[id]);

  useEffect(()=>{void load()},[load]);
  useEffect(()=>{let active=true;async function recordView(){const {data:session}=await getSession();if(!session.session||!id)return;const {error}=await supabase.from('customer_turf_views').upsert({user_id:session.session.user.id,turf_id:id,last_viewed_at:new Date().toISOString()},{onConflict:'user_id,turf_id'});if(active&&error)setError(error.message)}void recordView();return()=>{active=false}},[id]);
  useEffect(()=>{let active=true;async function readFavorite(){const {data:session}=await getSession();if(!session.session||!id)return;const {data,error}=await supabase.from('favourites').select('turf_id').eq('user_id',session.session.user.id).eq('turf_id',id).maybeSingle();if(active&&!error)setFavorite(!!data)}void readFavorite();return()=>{active=false}},[id]);

  async function toggleFavorite(){
    const {data:session}=await getSession();
    if(!session.session){navigate('/login');return}
    setSavingFavorite(true);setError('');
    const {data,error}=await supabase.rpc('toggle_favourite',{p_turf_id:id});
    if(error)setError(error.message);else setFavorite(!!data);
    setSavingFavorite(false);
  }

  async function share(){
    if(!turf)return;
    const url=window.location.href;
    try{
      if(navigator.share)await navigator.share({title:turf.name,text:`View ${turf.name} on TURFBOOK`,url});
      else{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}
    }catch(err){if(err instanceof Error&&err.name!=='AbortError')setError('Unable to share this turf from your browser.')}
  }

  async function compareTurf(){
    if(!turf)return;
    const ids=JSON.parse(sessionStorage.getItem('turfbook-compare-ids')||'[]') as string[];
    const next=[...new Set([...ids,turf.id])].slice(-3);
    sessionStorage.setItem('turfbook-compare-ids',JSON.stringify(next));
    const {data,error}=await supabase.from('turfs')
      .select('*,turf_images(url,sort_order,is_primary),turf_sports(sports(name,slug)),turf_facilities(facilities(name)),reviews(rating,review_text,created_at,approved)')
      .in('id',next);
    if(error){setError(error.message);return}
    setCompare((data||[]) as unknown as TurfDetailsData[]);
  }

  if(loading)return <main className="mx-auto max-w-7xl px-5 py-24 text-center text-slate-500">Loading turf details…</main>;
  if(error&&!turf)return <main className="mx-auto max-w-7xl px-5 py-24 text-center"><p role="alert" className="text-red-300">{error}</p><button onClick={()=>void load()} className="mt-4 rounded-xl border border-white/10 px-4 py-2">Try again</button></main>;
  if(!turf)return <main className="mx-auto max-w-7xl px-5 py-24 text-center"><h1 className="text-2xl font-bold">Turf not found</h1><Link className="accent mt-3 inline-block" to="/explore">Back to explore</Link></main>;

  const images=[...turf.turf_images].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order);
  const address=[turf.address,turf.area,turf.city].filter(Boolean).join(', ');
  const bookQuery=new URLSearchParams();
  for(const key of ['date','sport','time']){const value=params.get(key);if(value)bookQuery.set(key,value)}
  const bookingUrl=`/book/${turf.id}${bookQuery.size?`?${bookQuery}`:''}`;
  const facilities=turf.turf_facilities.map(item=>item.facilities?.name).filter((name):name is string=>!!name);
  const visibleReviews=turf.reviews.filter(review=>review.approved);
  const policy=turf.cancellation_policy||{};

  return <main className="mx-auto max-w-7xl px-5 py-10">
    <Link to="/explore" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400"><ArrowLeft size={16}/>Back to explore</Link>
    {error&&<p role="alert" className="mb-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
    <div className="grid gap-7 lg:grid-cols-[1.35fr_.65fr]">
      <section>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="aspect-[16/10] overflow-hidden rounded-3xl bg-[#111722] sm:row-span-2 sm:aspect-auto">{images[0]?.url||turf.cover_image_url?<img src={images[0]?.url||turf.cover_image_url||''} alt={turf.name} className="h-full min-h-64 w-full object-cover"/>:<div className="grid h-full min-h-64 place-items-center text-slate-600">Venue photo not provided</div>}</div>
          {images.slice(1,3).map(image=><img key={image.url} src={image.url} alt={`${turf.name} venue`} className="hidden h-40 w-full rounded-2xl object-cover sm:block"/> )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black md:text-4xl">{turf.name}</h1><span className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-sm"><Star size={15} fill="currentColor" className="text-yellow-300"/>{Number(turf.rating).toFixed(1)} <span className="text-slate-500">({turf.review_count} reviews)</span></span></div>
        <p className="mt-3 flex items-start gap-2 text-slate-400"><MapPin size={17} className="mt-1 shrink-0 accent"/>{address||'Location has not been provided'}</p>
        {turf.latitude!=null&&turf.longitude!=null&&<a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${turf.latitude},${turf.longitude}`} className="mt-2 inline-flex items-center gap-2 text-sm accent">Open map <MapPin size={14}/></a>}
        <p className="mt-5 leading-7 text-slate-300">{turf.description||'No venue description provided.'}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <section className="card p-5"><h2 className="font-bold">Available sports</h2><div className="mt-3 flex flex-wrap gap-2">{turf.turf_sports.map(({sports:game})=>game&&<span key={game.slug} className="rounded-full bg-lime-300/10 px-3 py-1.5 text-sm text-lime-200">{game.name}</span>)}{turf.turf_sports.length===0&&<p className="text-sm text-slate-500">Sports information unavailable.</p>}</div></section>
          <section className="card p-5"><h2 className="font-bold">Facilities</h2><div className="mt-3 flex flex-wrap gap-2">{facilities.map(item=><span key={item} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-slate-300">{item}</span>)}{facilities.length===0&&<p className="text-sm text-slate-500">No facilities listed.</p>}</div></section>
          <section className="card p-5"><h2 className="flex items-center gap-2 font-bold"><Clock3 size={17} className="accent"/>Opening hours</h2><p className="mt-3 text-sm text-slate-300">{turf.opening_time?.slice(0,5)||'—'} – {turf.closing_time?.slice(0,5)||'—'} · {turf.indoor?'Indoor':'Outdoor'} {turf.turf_type&&`· ${turf.turf_type}`}</p></section>
          <section className="card p-5"><h2 className="font-bold">Rules & cancellation</h2><p className="mt-3 whitespace-pre-line text-sm text-slate-400">{turf.rules||'No special rules provided.'}</p><p className="mt-3 text-xs text-slate-500">{Object.keys(policy).length?Object.entries(policy).map(([key,value])=>`${key.replaceAll('_',' ')}: ${String(value)}`).join(' · '):'Cancellation terms are confirmed during booking.'}</p></section>
        </div>
        <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Verified customer reviews</h2><Link to="/reviews" className="text-sm accent">All reviews →</Link></div>{visibleReviews.length===0?<p className="mt-4 rounded-xl border border-white/10 p-5 text-sm text-slate-500">No approved reviews yet.</p>:<div className="mt-4 space-y-3">{visibleReviews.slice(0,5).map((review,index)=><article key={`${review.created_at}-${index}`} className="card p-4"><div className="flex items-center gap-1">{[1,2,3,4,5].map(star=><Star key={star} size={14} className={star<=review.rating?'fill-current text-yellow-300':'text-slate-700'}/>)}</div><p className="mt-2 text-sm text-slate-300">{review.review_text||'Rating only'}</p><p className="mt-2 text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</p></article>)}</div>}</section>
      </section>
      <aside className="h-fit space-y-4 lg:sticky lg:top-24">
        <section className="card p-6"><p className="text-sm text-slate-500">Starting from</p><p className="mt-1 text-3xl font-black accent">₹{Number(turf.starting_price).toFixed(0)}<span className="text-sm font-normal text-slate-500"> / slot</span></p><div className="my-6 space-y-3 text-sm text-slate-300"><div className="flex items-center gap-3"><CalendarDays size={17} className="accent"/>Choose date & sport</div><div className="flex items-center gap-3"><Clock3 size={17} className="accent"/>Check real-time slot availability</div></div><Link to={bookingUrl} className="accent-bg flex w-full justify-center rounded-xl py-3 font-bold">Book now</Link><button disabled={savingFavorite} onClick={()=>void toggleFavorite()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 font-semibold disabled:opacity-50"><Heart size={17} className={favorite?'fill-pink-400 text-pink-400':''}/>{favorite?'Remove favourite':'Add to favourite'}</button><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>void share()} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-semibold"><Share2 size={16}/>{copied?'Copied':'Share'}</button><button onClick={()=>void compareTurf()} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-semibold"><Waypoints size={16}/>Compare</button></div></section>
      </aside>
    </div>
    {compare.length>0&&<section className="card mt-10 overflow-x-auto p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Turf comparison</h2><button onClick={()=>{sessionStorage.removeItem('turfbook-compare-ids');setCompare([])}} className="text-sm text-slate-400">Clear compare</button></div><table className="mt-4 w-full min-w-[520px] text-left text-sm"><tbody><tr><th className="p-3 text-slate-500">Turf</th>{compare.map(item=><td key={item.id} className="p-3 font-bold">{item.name}</td>)}</tr><tr><th className="p-3 text-slate-500">Price from</th>{compare.map(item=><td key={item.id} className="p-3">₹{Number(item.starting_price).toFixed(0)}</td>)}</tr><tr><th className="p-3 text-slate-500">Rating</th>{compare.map(item=><td key={item.id} className="p-3">★ {Number(item.rating).toFixed(1)}</td>)}</tr><tr><th className="p-3 text-slate-500">Location</th>{compare.map(item=><td key={item.id} className="p-3">{[item.area,item.city].filter(Boolean).join(', ')||'Not listed'}</td>)}</tr><tr><th className="p-3 text-slate-500">Sports</th>{compare.map(item=><td key={item.id} className="p-3">{item.turf_sports.map(({sports:game})=>game?.name).filter(Boolean).join(', ')||'Not listed'}</td>)}</tr><tr><th className="p-3 text-slate-500">Facilities</th>{compare.map(item=><td key={item.id} className="p-3">{item.turf_facilities.map(({facilities:itemFacility})=>itemFacility?.name).filter(Boolean).join(', ')||'Not listed'}</td>)}</tr></tbody></table><div className="mt-4 flex flex-wrap gap-2">{compare.map(item=><Link key={item.id} to={`/book/${item.id}`} className="accent-bg rounded-lg px-4 py-2 text-sm font-bold">Book {item.name}</Link>)}</div></section>}
  </main>
}
