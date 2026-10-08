import { Mail, Phone, Instagram, Github, MapPin } from 'lucide-react';

export default function Contact(){
  return (
    <main className="min-h-[calc(100vh-73px)] px-5 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <p className="accent text-sm font-bold uppercase tracking-[.22em]">TURFBOOK</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Contact Us</h1>
          <p className="mt-4 text-slate-400">Have a question about turf booking or TURFBOOK? Get in touch with us through the details below.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="card p-7">
            <div className="flex items-center gap-4">
              <div className="accent-bg flex h-14 w-14 items-center justify-center rounded-2xl text-black">
                <Phone size={24}/>
              </div>
              <div>
                <p className="text-sm text-slate-400">Contact Person</p>
                <h2 className="text-2xl font-black">MADHANKUMAR</h2>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <a href="tel:+918608071854" className="flex items-center gap-4 rounded-2xl border border-white/10 p-4 transition hover:border-white/20">
                <Phone size={20} className="accent"/><div><p className="text-xs text-slate-500">Phone</p><p className="font-semibold">86080 71854</p></div>
              </a>
              <a href="mailto:madhanmadhan39665@gmail.com" className="flex items-center gap-4 rounded-2xl border border-white/10 p-4 transition hover:border-white/20">
                <Mail size={20} className="accent"/><div><p className="text-xs text-slate-500">Email</p><p className="break-all font-semibold">madhanmadhan39665@gmail.com</p></div>
              </a>
            </div>
          </div>

          <div className="card p-7">
            <p className="text-sm font-semibold text-slate-400">Social</p>
            <h2 className="mt-2 text-2xl font-black">Connect with us</h2>
            <div className="mt-6 space-y-4">
              <a href="https://www.instagram.com/zaira_madhan26?stkn=cDBkdnY0Z3ptYnkz" target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-2xl border border-white/10 p-4 transition hover:border-white/20">
                <Instagram size={22} className="accent"/><div><p className="text-xs text-slate-500">Instagram</p><p className="font-semibold">@zaira_madhan26</p></div>
              </a>
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 p-4 opacity-60">
                <Github size={22} className="text-slate-400"/><div><p className="text-xs text-slate-500">GitHub</p><p className="font-semibold">Not provided</p></div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-white/10 p-4">
                <MapPin size={22} className="accent"/><div><p className="text-xs text-slate-500">TURFBOOK</p><p className="font-semibold">Smart Turf Booking &amp; Management Platform</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
