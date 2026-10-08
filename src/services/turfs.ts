import { supabase } from '../lib/supabase';
import type { Turf } from '../types';

export async function getTurfs(search=''){
  let q=supabase
    .from('turfs')
    .select('id,name,description,area,city,latitude,longitude,cover_image_url,rating,review_count,starting_price,indoor,status,approval_status,turf_type,opening_time,closing_time,turf_sports(sports(name,slug)),turf_facilities(facilities(name))')
    .eq('status','ACTIVE')
    .eq('approval_status','APPROVED')
    .order('rating',{ascending:false});

  if(search) q=q.or(`name.ilike.%${search}%,area.ilike.%${search}%,city.ilike.%${search}%`);
  const {data,error}=await q;
  if(error) throw error;

  return (data??[]).map((row:any)=>({
    ...row,
    sports:(row.turf_sports??[]).map((item:any)=>item.sports).filter(Boolean),
    facilities:(row.turf_facilities??[]).map((item:any)=>item.facilities?.name).filter(Boolean),
  })) as Turf[];
}
