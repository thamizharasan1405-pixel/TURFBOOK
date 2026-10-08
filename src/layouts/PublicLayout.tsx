import {useEffect,useState} from 'react';
import {Link,Outlet,useNavigate} from 'react-router-dom';
import {LogOut,Menu} from 'lucide-react';
import {getRole,getSession,signOut} from '../lib/auth';
import {supabase} from '../lib/supabase';

export default function PublicLayout(){
  const nav=useNavigate();
  const [role,setRole]=useState<string>();
  useEffect(()=>{
    let active=true;
    async function loadRole(userId:string|undefined){
      if(!userId){if(active)setRole(undefined);return}
      try{const nextRole=await getRole(userId);if(active)setRole(nextRole)}
      catch{if(active)setRole('UNAVAILABLE')}
    }
    void getSession().then(({data,error})=>{
      if(error)throw error;
      return loadRole(data.session?.user.id);
    }).catch(()=>{if(active)setRole('UNAVAILABLE')});
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      void loadRole(session?.user.id);
    });
    return()=>{active=false;data.subscription.unsubscribe()}
  },[]);
  const dashboard=role==='OWNER'?'/owner':role==='ADMIN'?'/admin':role==='STAFF'?'/staff/qr':'/dashboard';
  const dashboardLabel=role==='OWNER'?'Owner dashboard':role==='ADMIN'?'Admin dashboard':role==='STAFF'?'Staff dashboard':role==='UNAVAILABLE'?'Account unavailable':'Customer dashboard';
  return <div className="min-h-screen bg-[#080b12] text-white">
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#080b12]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link to="/" className="text-xl font-black tracking-tight">TURF<span className="accent">BOOK</span></Link>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <Link to="/explore" className="hover:text-white">Explore</Link>
          <Link to="/about" className="hover:text-white">How it works</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
        </nav>
        <div className="flex items-center gap-2">
          {role&&role!=='UNAVAILABLE'?<>
            <Link to={dashboard} className="rounded-xl border border-white/10 px-4 py-2 text-sm">{dashboardLabel}</Link>
            <button onClick={async()=>{const {error}=await signOut();if(error)return;setRole(undefined);nav('/')}} className="rounded-xl p-2 text-slate-400 hover:text-white" aria-label="Sign out"><LogOut size={18}/></button>
          </>:<>
            <Link to="/login" className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm md:block">{role==='UNAVAILABLE'?'Sign in again':'Login'}</Link>
            <Link to="/register" className="accent-bg rounded-xl px-4 py-2 text-sm font-bold">Get Started</Link>
          </>}
          <Menu className="ml-2 md:hidden"/>
        </div>
      </div>
    </header>
    <Outlet/>
  </div>
}
