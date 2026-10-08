import {Link} from 'react-router-dom';
import {Building2,CalendarCheck,IndianRupee,Users,Plus,Settings,type LucideIcon} from 'lucide-react';

const stats:{title:string;value:string;icon:LucideIcon}[]=[
  {title:'My Turfs',value:'0',icon:Building2},
  {title:'Today bookings',value:'0',icon:CalendarCheck},
  {title:'Today revenue',value:'₹0',icon:IndianRupee},
  {title:'Active staff',value:'0',icon:Users},
];

export default function OwnerDashboard(){return <main className="mx-auto max-w-7xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="accent text-sm font-bold uppercase tracking-[.2em]">Owner dashboard</p><h1 className="mt-2 text-4xl font-black">Manage your turf business.</h1><p className="mt-3 text-slate-400">Bookings, availability and revenue in one place.</p></div><Link to="/owner/turfs/new" className="accent-bg flex items-center gap-2 rounded-xl px-5 py-3 font-bold"><Plus size={18}/> Add turf</Link></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(({title,value,icon:Icon})=><div className="card p-5" key={title}><Icon className="accent"/><p className="mt-5 text-sm text-slate-500">{title}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]"><section className="card p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Your turfs</h2><Link to="/owner/turfs" className="text-sm accent">Manage all</Link></div><div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">No turf added yet.<br/><Link className="accent" to="/owner/turfs/new">Create your first turf →</Link></div></section><section className="card p-6"><h2 className="text-xl font-bold">Quick settings</h2><div className="mt-5 space-y-3"><Link to="/owner/slots" className="block rounded-xl bg-white/5 p-4">Slot management</Link><Link to="/owner/bookings" className="block rounded-xl bg-white/5 p-4">Bookings</Link><Link to="/owner/settings" className="flex items-center gap-2 rounded-xl bg-white/5 p-4"><Settings size={17}/> Business settings</Link></div></section></div></main>}
