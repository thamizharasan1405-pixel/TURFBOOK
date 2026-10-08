import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  Activity,Building2,CalendarDays,ChartNoAxesCombined,Check,ChevronDown,ClipboardList,
  CreditCard,FileText,Flag,Gift,Headset,LoaderCircle,LogOut,Menu,MessageSquare,
  Search,Send,Settings,Shield,ShieldCheck,Store,Ticket,Users,X,
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {getSession,signOut} from '../../lib/auth';

type Row=Record<string,unknown>;
type PanelKey='overview'|'customers'|'owners'|'staff'|'turfs'|'bookings'|'payments'|'refunds'|'coupons'|'reviews'|'teams'|'membershipPlans'|'membershipUsers'|'tournaments'|'registrations'|'matches'|'maintenance'|'blockedSlots'|'support'|'notifications'|'reports'|'audit'|'settings';
type FieldSpec={name:string;label:string;type?:string;required?:boolean;placeholder?:string};
type PanelConfig={title:string;table:string;select:string;order:string;columns:string[];createFields?:FieldSpec[];key:string};
type Metric={users:number;customers:number;owners:number;staff:number;turfs:number;bookings:number;revenue:number;payments:number;refunds_pending:number;complaints_open:number};
type StaffCandidate={user_id:string;full_name:string|null;email:string|null;role:string};
type NavItem={key:PanelKey;label:string;icon:LucideIcon};

const groups:{title:string;items:NavItem[]}[]=[
  {title:'Platform',items:[{key:'overview',label:'Dashboard',icon:ChartNoAxesCombined},{key:'reports',label:'Reports & analytics',icon:Activity},{key:'audit',label:'Audit logs',icon:ClipboardList},{key:'settings',label:'System settings',icon:Settings}]},
  {title:'People',items:[{key:'customers',label:'Customers',icon:Users},{key:'owners',label:'Turf owners',icon:ShieldCheck},{key:'staff',label:'Staff',icon:Shield}]},
  {title:'Marketplace',items:[{key:'turfs',label:'Turfs',icon:Store},{key:'bookings',label:'Bookings',icon:CalendarDays},{key:'payments',label:'Payments',icon:CreditCard},{key:'refunds',label:'Refunds',icon:FileText},{key:'coupons',label:'Coupons & offers',icon:Gift},{key:'reviews',label:'Reviews',icon:MessageSquare}]},
  {title:'Community',items:[{key:'teams',label:'Teams',icon:Users},{key:'membershipPlans',label:'Memberships',icon:ShieldCheck},{key:'tournaments',label:'Tournaments',icon:Flag},{key:'support',label:'Support tickets',icon:Headset},{key:'notifications',label:'Notifications',icon:Send}]},
  {title:'Operations',items:[{key:'maintenance',label:'Maintenance',icon:Building2}]},
];

const panelConfig:Partial<Record<PanelKey,PanelConfig>>={
  customers:{title:'Customers',table:'profiles',select:'id,full_name,email,phone,status,created_at,user_roles(role)',order:'created_at',columns:['full_name','email','phone','status','user_roles','created_at'],key:'id'},
  owners:{title:'Turf owners',table:'owner_profiles',select:'user_id,business_name,business_address,verification_status,profiles(full_name,email,phone),user_roles(role)',order:'verification_status',columns:['business_name','business_address','profiles','verification_status','user_id'],key:'user_id'},
  staff:{title:'Staff',table:'staff_profiles',select:'user_id,owner_id,phone,status,profiles(full_name,email),staff_turfs(turf_id,turfs(name))',order:'status',columns:['profiles','phone','status','owner_id','staff_turfs'],key:'user_id'},
  turfs:{title:'Turfs',table:'turfs',select:'id,name,owner_id,city,area,turf_type,indoor,status,approval_status,starting_price,rating',order:'created_at',columns:['name','owner_id','city','area','turf_type','indoor','status','approval_status','starting_price','rating'],key:'id',createFields:[{name:'name',label:'Turf name',required:true},{name:'owner_id',label:'Owner user ID',required:true},{name:'city',label:'City'},{name:'area',label:'Area'},{name:'address',label:'Address'},{name:'contact_number',label:'Contact number'},{name:'opening_time',label:'Opening time',type:'time',required:true},{name:'closing_time',label:'Closing time',type:'time',required:true},{name:'turf_type',label:'Type',required:true},{name:'indoor',label:'Indoor (true/false)',required:true},{name:'starting_price',label:'Starting price',type:'number',required:true}]},
  bookings:{title:'Bookings',table:'bookings',select:'id,customer_id,turf_id,booking_date,start_time,end_time,final_amount,booking_status,payment_status,turfs(name),profiles:bookings_customer_id_fkey(full_name,email)',order:'booking_date',columns:['id','profiles','turfs','booking_date','start_time','end_time','final_amount','booking_status','payment_status'],key:'id'},
  payments:{title:'Payments',table:'payments',select:'id,booking_id,amount,method,status,transaction_id,gateway_reference,paid_at,created_at',order:'created_at',columns:['booking_id','amount','method','status','transaction_id','gateway_reference','paid_at'],key:'id'},
  refunds:{title:'Refund queue',table:'refunds',select:'id,booking_id,amount,reason,status,refund_transaction_id,requested_at,completed_at',order:'requested_at',columns:['booking_id','amount','reason','status','refund_transaction_id','requested_at','completed_at'],key:'id'},
  coupons:{title:'Coupons & offers',table:'coupons',select:'id,code,description,discount_type,discount_value,min_booking_amount,max_discount,usage_limit,per_user_limit,start_at,expires_at,active',order:'created_at',columns:['code','description','discount_type','discount_value','min_booking_amount','usage_limit','expires_at','active'],key:'id',createFields:[{name:'code',label:'Coupon code',required:true},{name:'description',label:'Description'},{name:'discount_type',label:'Discount type (FLAT or PERCENTAGE)',required:true},{name:'discount_value',label:'Discount value',type:'number',required:true},{name:'min_booking_amount',label:'Minimum booking amount',type:'number'},{name:'max_discount',label:'Maximum discount',type:'number'},{name:'usage_limit',label:'Total usage limit',type:'number'},{name:'per_user_limit',label:'Per-customer limit',type:'number'},{name:'start_at',label:'Starts at',type:'datetime-local',required:true},{name:'expires_at',label:'Expires at',type:'datetime-local',required:true}]},
  reviews:{title:'Reviews & moderation',table:'reviews',select:'id,booking_id,turf_id,customer_id,rating,review_text,approved,status,created_at',order:'created_at',columns:['rating','review_text','customer_id','turf_id','approved','status','created_at'],key:'id'},
  teams:{title:'Customer teams',table:'teams',select:'id,name,captain_id,created_at,team_members(count)',order:'created_at',columns:['name','captain_id','team_members','created_at'],key:'id'},
  membershipPlans:{title:'Membership plans',table:'membership_plans',select:'id,name,price,duration_days,discount_percentage,booking_benefits,cancellation_benefits,active,created_at',order:'price',columns:['name','price','duration_days','discount_percentage','booking_benefits','cancellation_benefits','active'],key:'id',createFields:[{name:'name',label:'Plan name',required:true},{name:'price',label:'Price',type:'number',required:true},{name:'duration_days',label:'Duration (days)',type:'number',required:true},{name:'discount_percentage',label:'Booking discount (%)',type:'number'},{name:'booking_benefits',label:'Booking benefits'},{name:'cancellation_benefits',label:'Cancellation benefits'}]},
  membershipUsers:{title:'Customer memberships',table:'user_memberships',select:'id,user_id,plan_id,start_date,end_date,status,membership_plans(name)',order:'end_date',columns:['user_id','membership_plans','start_date','end_date','status'],key:'id'},
  tournaments:{title:'Tournaments',table:'tournaments',select:'id,name,owner_id,turf_id,sport_id,start_date,end_date,registration_deadline,entry_fee,max_teams,status',order:'start_date',columns:['name','owner_id','turf_id','sport_id','start_date','end_date','entry_fee','max_teams','status'],key:'id',createFields:[{name:'name',label:'Tournament name',required:true},{name:'owner_id',label:'Organizer owner user ID'},{name:'turf_id',label:'Turf ID'},{name:'sport_id',label:'Sport ID'},{name:'start_date',label:'Start date',type:'date',required:true},{name:'end_date',label:'End date',type:'date',required:true},{name:'registration_deadline',label:'Registration deadline',type:'date'},{name:'entry_fee',label:'Entry fee',type:'number'},{name:'max_teams',label:'Maximum teams',type:'number'},{name:'status',label:'Status',placeholder:'DRAFT / OPEN / PUBLISHED'}]},
  registrations:{title:'Tournament registrations',table:'tournament_teams',select:'id,tournament_id,team_id,captain_id,payment_status,registered_at',order:'registered_at',columns:['tournament_id','team_id','captain_id','payment_status','registered_at'],key:'id'},
  matches:{title:'Tournament matches & results',table:'tournament_matches',select:'id,tournament_id,round_name,match_number,team_a_id,team_b_id,scheduled_at,score_a,score_b,winner_team_id,status',order:'scheduled_at',columns:['tournament_id','round_name','match_number','team_a_id','team_b_id','scheduled_at','score_a','score_b','winner_team_id','status'],key:'id',createFields:[{name:'tournament_id',label:'Tournament ID',required:true},{name:'round_name',label:'Round',required:true},{name:'match_number',label:'Match number',type:'number',required:true},{name:'team_a_id',label:'Team A ID'},{name:'team_b_id',label:'Team B ID'},{name:'scheduled_at',label:'Schedule',type:'datetime-local'},{name:'score_a',label:'Team A score',type:'number'},{name:'score_b',label:'Team B score',type:'number'},{name:'status',label:'Status'}]},
  maintenance:{title:'Maintenance schedules',table:'maintenance_records',select:'id,turf_id,start_at,end_at,reason,status,created_by,created_at',order:'start_at',columns:['turf_id','start_at','end_at','reason','status','created_by'],key:'id',createFields:[{name:'turf_id',label:'Turf ID',required:true},{name:'start_at',label:'Starts at',type:'datetime-local',required:true},{name:'end_at',label:'Ends at',type:'datetime-local',required:true},{name:'reason',label:'Reason',required:true}]},
  blockedSlots:{title:'Blocked time slots',table:'blocked_slots',select:'id,turf_id,booking_date,start_time,end_time,reason,created_by,created_at',order:'booking_date',columns:['turf_id','booking_date','start_time','end_time','reason','created_by'],key:'id'},
  support:{title:'Support & complaints',table:'support_tickets',select:'id,user_id,booking_id,category,subject,description,priority,status,created_at,updated_at',order:'created_at',columns:['category','subject','description','booking_id','priority','status','created_at'],key:'id'},
  notifications:{title:'Platform notifications',table:'notifications',select:'id,user_id,type,title,message,read_at,created_at',order:'created_at',columns:['user_id','type','title','message','read_at','created_at'],key:'id'},
  audit:{title:'Audit logs',table:'audit_logs',select:'id,actor_id,action,entity,entity_id,old_value,new_value,created_at',order:'created_at',columns:['actor_id','action','entity','entity_id','old_value','new_value','created_at'],key:'id'},
  settings:{title:'System settings',table:'system_settings',select:'key,value,updated_at',order:'key',columns:['key','value','updated_at'],key:'key'},
};

const initialMetrics:Metric={users:0,customers:0,owners:0,staff:0,turfs:0,bookings:0,revenue:0,payments:0,refunds_pending:0,complaints_open:0};
const card='rounded-2xl border border-white/[.08] bg-[#101620]';
const inputClass='w-full rounded-xl border border-white/10 bg-[#0b1018] px-3 py-2.5 text-sm text-white outline-none focus:border-lime-300/50';
const safeString=(value:unknown):string=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
const displayLabel=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const uid=(row:Row,key:string)=>String(row[key]??'');
const isRow=(value:unknown):value is Row=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const isStaffCandidate=(value:unknown):value is StaffCandidate=>typeof value==='object'&&value!==null&&'user_id' in value&&'role' in value;

function fieldsFor(key:PanelKey):FieldSpec[]{
  if(key==='staff')return[{name:'user_id',label:'Existing account user ID',required:true},{name:'phone',label:'Staff phone number'},{name:'turf_ids',label:'Assigned turf IDs (comma-separated)'}];
  if(key==='blockedSlots')return[{name:'turf_id',label:'Turf ID',required:true},{name:'booking_date',label:'Date',type:'date',required:true},{name:'start_time',label:'Start time',type:'time',required:true},{name:'end_time',label:'End time',type:'time',required:true},{name:'reason',label:'Reason',required:true}];
  if(key==='notifications')return[{name:'role',label:'Send to role (CUSTOMER / OWNER / STAFF / ADMIN)',required:true},{name:'type',label:'Notification type',required:true},{name:'title',label:'Title',required:true},{name:'message',label:'Message',required:true}];
  return panelConfig[key]?.createFields||[];
}

export default function AdminDashboard(){
  const navigate=useNavigate();
  const [active,setActive]=useState<PanelKey>('overview');
  const [rows,setRows]=useState<Row[]>([]);
  const [metrics,setMetrics]=useState<Metric>(initialMetrics);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const [form,setForm]=useState<Record<string,string>>({});
  const [saving,setSaving]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [userId,setUserId]=useState('');
  const [staffCandidates,setStaffCandidates]=useState<StaffCandidate[]>([]);

  const config=panelConfig[active];
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const {data:session,error:sessionError}=await getSession();
      if(sessionError)throw sessionError;
      if(!session.session){navigate('/login',{replace:true});return}
      setUserId(session.session.user.id);
      if(active==='overview'||active==='reports'){
        const [{data:metricData,error:metricError},{data:bookingData,error:bookingError}]=await Promise.all([
          supabase.rpc('admin_dashboard_metrics'),
          supabase.from('bookings').select('booking_date,final_amount,booking_status,created_at').order('booking_date',{ascending:false}).limit(1000),
        ]);
        if(metricError)throw metricError;
        if(bookingError)throw bookingError;
        setMetrics({...initialMetrics,...metricData});
        setRows((bookingData||[]) as Row[]);
      }else if(config){
        const {data,error}=await supabase.from(config.table).select(config.select)
          .order(config.order,{ascending:active==='membershipPlans'||active==='tournaments'||active==='blockedSlots'||active==='settings'})
          .limit(250);
        if(error)throw error;
        const records:Row[]=(data||[]).reduce<Row[]>((result,record)=>{
          if(isRow(record))result.push(record);
          return result;
        },[]);
        setRows(active==='customers'
          ?records.filter(row=>{
            const roles=row.user_roles;
            const role=Array.isArray(roles)?roles[0]?.role:(roles as Row|null)?.role;
            return role==='CUSTOMER';
          })
          :records);
        if(active==='staff'){
          const {data:candidates,error:candidateError}=await supabase.rpc('admin_staff_candidates');
          if(candidateError)throw candidateError;
          setStaffCandidates((candidates||[]).filter(isStaffCandidate));
        }
      }
    }catch(err){setError(err instanceof Error?err.message:'Unable to load admin data.')}
    finally{setLoading(false)}
  },[active,config,navigate]);

  useEffect(()=>{void load()},[load]);
  const filteredRows=useMemo(()=>{
    const text=query.trim().toLowerCase();
    return text?rows.filter(row=>JSON.stringify(row).toLowerCase().includes(text)):rows;
  },[rows,query]);

  async function audit(action:string,entity:string,entityId:string,details:Row={}){
    const {error}=await supabase.from('audit_logs').insert({
      actor_id:userId,action,entity,
      entity_id:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entityId)?entityId:null,
      new_value:details,
    });
    if(error)throw error;
  }

  async function runAction(label:string,action:()=>Promise<void>,entity:string,entityId:string,details:Row={}){
    setError('');setMessage('');
    try{
      await action();
      await audit(label.toUpperCase().replaceAll(' ','_'),entity,entityId,details);
      setMessage(`${label} completed.`);
      await load();
    }catch(err){
      setError(err instanceof Error?err.message:`Unable to ${label.toLowerCase()}.`);
    }
  }

  async function createRecord(event:FormEvent){
    event.preventDefault();
    if(!config)return;
    setSaving(true);setError('');setMessage('');
    try{
      let result:unknown;
      if(active==='staff'){
        const turfIds=(form.turf_ids||'').split(',').map(value=>value.trim()).filter(Boolean);
        const response=await supabase.rpc('admin_add_staff',{
          p_user_id:form.user_id,p_phone:form.phone||null,p_turf_ids:turfIds,
        });
        if(response.error)throw response.error;
        result=form.user_id;
      }else if(active==='blockedSlots'){
        const {data,error}=await supabase.rpc('admin_create_blocked_slot',{
          p_turf_id:form.turf_id,p_booking_date:form.booking_date,p_start_time:form.start_time,
          p_end_time:form.end_time,p_reason:form.reason,
        });
        if(error)throw error;
        result=data;
      }else if(active==='notifications'){
        const role=form.role.trim().toUpperCase();
        if(!['CUSTOMER','OWNER','STAFF','ADMIN'].includes(role))throw new Error('Choose a valid user role.');
        const {data:targets,error:targetError}=await supabase.from('user_roles').select('user_id').eq('role',role);
        if(targetError)throw targetError;
        if(!targets?.length)throw new Error(`There are no ${role.toLowerCase()} accounts to notify.`);
        const {error}=await supabase.from('notifications').insert(targets.map(target=>({
          user_id:target.user_id,type:form.type.trim(),title:form.title.trim(),message:form.message.trim(),
        })));
        if(error)throw error;
        result=`${targets.length} recipients`;
      }else{
        const values:Row={...form};
        for(const [key,value] of Object.entries(values)){
          if(typeof value!=='string')continue;
          if(value===''){values[key]=null;continue}
          if(['price','duration_days','discount_percentage','discount_value','min_booking_amount','max_discount','usage_limit','per_user_limit','entry_fee','max_teams','match_number','score_a','score_b','starting_price'].includes(key))values[key]=Number(value);
          if(['indoor','active'].includes(key))values[key]=value.toLowerCase()==='true';
          if(['start_at','end_at','expires_at','scheduled_at'].includes(key))values[key]=new Date(value).toISOString();
        }
        if(active==='coupons'){values.code=String(values.code).toUpperCase();values.owner_id=null;values.active=true}
        if(active==='membershipPlans')values.active=true;
        if(active==='turfs'){values.indoor=String(form.indoor).toLowerCase()==='true';values.status='INACTIVE';values.approval_status='PENDING'}
        if(active==='tournaments'){values.status=String(values.status||'DRAFT').toUpperCase()}
        const {data,error}=await supabase.from(config.table).insert(values).select(config.select).single();
        if(error)throw error;
        result=data;
      }
      const resultRow=result&&typeof result==='object'?result as Row:null;
      const createdId=typeof result==='string'?result:resultRow&&config.key?resultRow[config.key]:null;
      await audit(`CREATE_${active.toUpperCase()}`,active,typeof createdId==='string'?createdId:'',{created:true});
      setMessage(`${config.title} item created.`);
      setForm({});setFormOpen(false);await load();
    }catch(err){setError(err instanceof Error?err.message:'Unable to create this item.')}
    finally{setSaving(false)}
  }

  async function updateField(table:string,keyColumn:string,keyValue:string,updates:Row,label:string){
    await runAction(label,async()=>{
      const {error}=await supabase.from(table).update(updates).eq(keyColumn,keyValue);
      if(error)throw error;
    },table,keyValue,updates);
  }

  function editStaff(row?:Row){
    const staffUserId=row?uid(row,'user_id'):'';
    const assigned=row?.staff_turfs;
    const turfIds=Array.isArray(assigned)?assigned.map(item=>String((item as Row).turf_id)).join(', '):'';
    setForm({user_id:staffUserId,phone:String(row?.phone||''),turf_ids:turfIds});
    setFormOpen(true);
  }

  async function handleStatus(row:Row,next:string){
    const id=uid(row,'id');
    if(active==='owners'){
      await runAction(`Owner application ${next.toLowerCase()}`,async()=>{
        const {error}=await supabase.rpc('admin_set_owner_application',{p_user_id:uid(row,'user_id'),p_status:next});
        if(error)throw error;
      },'owner_application',uid(row,'user_id'),{status:next});
      return;
    }
    if(active==='bookings'){
      await runAction(`Booking marked ${next.toLowerCase()}`,async()=>{
        const {error}=await supabase.rpc('admin_set_booking_status',{p_booking_id:id,p_status:next});
        if(error)throw error;
      },'booking',id,{status:next});
      return;
    }
    if(active==='refunds'){
      let reference:string|null=null;
      if(next==='COMPLETED'){
        reference=window.prompt('Enter the payment provider refund reference after you have actually issued the refund:')?.trim()||null;
        if(!reference)return;
      }
      if(!window.confirm(next==='COMPLETED'?'Confirm that the refund was issued successfully with the payment provider?':`Set this refund to ${next.toLowerCase()}?`))return;
      await runAction(`Refund marked ${next.toLowerCase()}`,async()=>{
        const {error}=await supabase.rpc('admin_resolve_refund',{p_refund_id:id,p_status:next,p_transaction_reference:reference});
        if(error)throw error;
      },'refund',id,{status:next,reference});
      return;
    }
    if(active==='staff'){
      const nextStatus=next;
      await runAction(`Staff ${nextStatus.toLowerCase()}`,async()=>{
        const {error}=await supabase.from('staff_profiles').update({status:nextStatus}).eq('user_id',uid(row,'user_id'));
        if(error)throw error;
        if(nextStatus==='INACTIVE'){
          const {error:roleError}=await supabase.from('user_roles').update({role:'CUSTOMER'}).eq('user_id',uid(row,'user_id'));
          if(roleError)throw roleError;
        }else{
          const {error:roleError}=await supabase.from('user_roles').update({role:'STAFF'}).eq('user_id',uid(row,'user_id'));
          if(roleError)throw roleError;
        }
      },'staff',uid(row,'user_id'),{status:nextStatus});
      return;
    }
    const idColumn=active==='customers'?'id':config?.key||'id';
    const table=config?.table;
    if(!table)return;
    if(active==='customers'){
      const status=next;
      await runAction(`Customer ${status.toLowerCase()}`,async()=>{
        const {error}=await supabase.from('profiles').update({status}).eq('id',id);
        if(error)throw error;
      },'customer',id,{status});
      return;
    }
    if(active==='turfs'){
      const field=next==='APPROVED'||next==='REJECTED'?'approval_status':'status';
      await updateField(table,idColumn,id,{[field]:next},`Turf ${next.toLowerCase()}`);
      return;
    }
    if(active==='coupons'||active==='membershipPlans'){
      await updateField(table,idColumn,id,{active:next==='true'},`${config.title} updated`);
      return;
    }
    if(active==='reviews'){
      await updateField(table,idColumn,id,{approved:next==='PUBLISHED',status:next},`Review ${next.toLowerCase()}`);
      return;
    }
    if(active==='membershipUsers'){
      await updateField(table,idColumn,id,{status:next},`Membership ${next.toLowerCase()}`);
      return;
    }
    if(active==='tournaments'){
      await updateField(table,idColumn,id,{status:next},`Tournament ${next.toLowerCase()}`);
      return;
    }
    if(active==='registrations'){
      await runAction('Tournament registration removed',async()=>{
        const {error}=await supabase.from(table).delete().eq(idColumn,id);
        if(error)throw error;
      },'tournament_registration',id,{removed:true});
      return;
    }
    if(active==='blockedSlots'){
      await runAction('Turf time slot unblocked',async()=>{
        const {error}=await supabase.from('blocked_slots').delete().eq('id',id);
        if(error)throw error;
      },'blocked_slot',id,{removed:true});
      return;
    }
    if(active==='notifications'){
      if(next!=='READ')return;
      await updateField('notifications','id',id,{read_at:new Date().toISOString()},'Notification marked read');
      return;
    }
    if(active==='settings'){
      if(next!=='EDIT_VALUE')return;
      const raw=window.prompt('Enter a valid JSON value for this setting:',JSON.stringify(row.value??null,null,2));
      if(raw===null)return;
      let value:unknown;
      try{value=JSON.parse(raw)}catch{setError('The setting value must be valid JSON.');return}
      await updateField('system_settings','key',id,{value,updated_at:new Date().toISOString()},'System setting updated');
      return;
    }
    if(active==='matches'){
      const scoreA=window.prompt('Enter the final score for Team A:',String(row.score_a??0));
      if(scoreA===null)return;
      const scoreB=window.prompt('Enter the final score for Team B:',String(row.score_b??0));
      if(scoreB===null)return;
      const a=Number(scoreA),b=Number(scoreB);
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0){setError('Match scores must be non-negative whole numbers.');return}
      const winner=a===b?null:a>b?row.team_a_id:row.team_b_id;
      await updateField(table,idColumn,id,{score_a:a,score_b:b,winner_team_id:winner,status:a===b?'DRAW':'COMPLETED'},'Match result saved');
      return;
    }
    if(active==='support'){
      if(next!=='REPLY'){
        await updateField(table,idColumn,id,{status:next,updated_at:new Date().toISOString()},`Ticket ${next.toLowerCase()}`);
        return;
      }
      const reply=window.prompt('Write a reply to this support ticket:');
      if(!reply?.trim())return;
      await runAction('Support reply sent',async()=>{
        const {error}=await supabase.from('support_messages').insert({
          ticket_id:id,sender_id:userId,message:reply.trim(),
        });
        if(error)throw error;
      },'support_ticket',id,{reply:reply.trim()});
      return;
    }
    if(active==='maintenance'){
      await updateField(table,idColumn,id,{status:next},`Maintenance ${next.toLowerCase()}`);
      return;
    }
    if(active==='teams'){
      await runAction('Team deleted',async()=>{
        const {error}=await supabase.from(table).delete().eq(idColumn,id);
        if(error)throw error;
      },'team',id,{deleted:true});
    }
  }

  async function editSimple(row:Row,column:string){
    const key=config?.key||'id';const id=uid(row,key);
    const current=row[column];
    const value=window.prompt(`Update ${displayLabel(column)}:`,typeof current==='string'?current:safeString(current));
    if(value===null)return;
    let next:unknown=value;
    if(['price','duration_days','discount_percentage','discount_value','min_booking_amount','max_discount','usage_limit','per_user_limit','entry_fee','max_teams','starting_price'].includes(column)){
      next=Number(value);if(!Number.isFinite(next)){setError('Enter a valid number.');return}
    }
    await updateField(config!.table,key,id,{[column]:next},`${displayLabel(column)} updated`);
  }

  function askStatus(row:Row,status:string,label:string){
    if(status==='EDIT_SCORE'){
      if(!window.confirm('Save a final match result?'))return;
      void handleStatus(row,status);
      return;
    }
    if(active==='refunds'){
      void handleStatus(row,status);
      return;
    }
    if(!window.confirm(`Confirm: ${label}?`))return;
    void handleStatus(row,status);
  }

  async function logout(){
    const {error}=await signOut();
    if(error){setError(error.message);return}
    navigate('/login',{replace:true});
  }

  const metricsCards=[
    {label:'Total users',value:metrics.users,icon:Users,link:'customers' as PanelKey},
    {label:'Customers',value:metrics.customers,icon:Users,link:'customers' as PanelKey},
    {label:'Turf owners',value:metrics.owners,icon:ShieldCheck,link:'owners' as PanelKey},
    {label:'Staff',value:metrics.staff,icon:Shield,link:'staff' as PanelKey},
    {label:'Turfs',value:metrics.turfs,icon:Store,link:'turfs' as PanelKey},
    {label:'Bookings',value:metrics.bookings,icon:CalendarDays,link:'bookings' as PanelKey},
    {label:'Successful payments',value:metrics.payments,icon:CreditCard,link:'payments' as PanelKey},
    {label:'Gross revenue',value:`₹${Number(metrics.revenue).toLocaleString('en-IN')}`,icon:ChartNoAxesCombined,link:'reports' as PanelKey},
    {label:'Refunds to review',value:metrics.refunds_pending,icon:FileText,link:'refunds' as PanelKey},
    {label:'Open complaints',value:metrics.complaints_open,icon:Headset,link:'support' as PanelKey},
  ];
  const navItems=groups.flatMap(group=>group.items);
  const title=active==='overview'?'Platform overview':active==='reports'?'Reports & analytics':config?.title||'Admin';

  return <div className="min-h-screen bg-[#080b12] text-white">
    <header className="sticky top-0 z-40 border-b border-white/[.08] bg-[#080b12]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3"><button className="rounded-lg border border-white/10 p-2 lg:hidden" onClick={()=>setMobileNav(!mobileNav)} aria-label="Toggle admin navigation"><Menu size={18}/></button><div><p className="text-lg font-black">TURF<span className="text-lime-300">BOOK</span></p><p className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Admin control center</p></div></div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/5 px-3 py-1.5 text-xs font-semibold text-lime-200 sm:flex"><ShieldCheck size={14}/> ADMIN</span><button onClick={()=>void logout()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white"><LogOut size={16}/><span className="hidden sm:inline">Sign out</span></button></div>
      </div>
    </header>
    <div className="mx-auto flex max-w-[1600px]">
      <aside className={`${mobileNav?'block':'hidden'} fixed inset-x-0 top-[65px] z-30 max-h-[calc(100vh-65px)] overflow-y-auto border-b border-white/10 bg-[#0b1018] p-4 lg:sticky lg:top-[65px] lg:block lg:h-[calc(100vh-65px)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:border-white/[.08]`}>
        {groups.map(group=><section key={group.title} className="mb-5"><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">{group.title}</p><div className="space-y-1">{group.items.map(item=>{const Icon=item.icon;return <button key={item.key} onClick={()=>{setActive(item.key);setQuery('');setMobileNav(false)}} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active===item.key?'bg-lime-300 text-slate-950 font-bold':'text-slate-400 hover:bg-white/[.04] hover:text-white'}`}><Icon size={17}/>{item.label}</button>})}
          {group.title==='Community'&&<div className="ml-8 mt-1 space-y-1">{([{key:'membershipUsers',label:'Membership users'},{key:'registrations',label:'Tournament teams'},{key:'matches',label:'Matches & results'}] as {key:PanelKey;label:string}[]).map(item=><button key={item.key} onClick={()=>{setActive(item.key);setQuery('');setMobileNav(false)}} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${active===item.key?'text-lime-200':'text-slate-500 hover:text-slate-200'}`}>{item.label}</button>)}</div>}
          {group.title==='Operations'&&<div className="ml-8 mt-1"><button onClick={()=>{setActive('blockedSlots');setQuery('');setMobileNav(false)}} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${active==='blockedSlots'?'text-lime-200':'text-slate-500 hover:text-slate-200'}`}>Blocked time slots</button></div>}
        </div></section>)}
        <p className="px-3 pb-3 text-[10px] text-slate-700">Signed in as {userId.slice(0,8)}…</p>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-lime-300">TURFBOOK / ADMIN</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 text-sm text-slate-500">{active==='overview'?'Securely manage the platform using your admin role.':config?.table?`Live records from public.${config.table}`:'Live platform data from Supabase.'}</p></div>
          {(config?.createFields||active==='staff'||active==='blockedSlots'||active==='notifications')&&<button onClick={()=>active==='staff'?editStaff():(setForm({}),setFormOpen(true))} className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-lime-200"><Check size={16}/>{active==='notifications'?'Compose notification':active==='staff'?'Add / assign staff':active==='blockedSlots'?'Block a slot':`Add ${config?.title.replace(/s$/,'').toLowerCase()}`}</button>}
        </div>

        {message&&<div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-lime-300/20 bg-lime-300/5 p-4 text-sm text-lime-200">{message}<button onClick={()=>setMessage('')} aria-label="Dismiss success message"><X size={16}/></button></div>}
        {error&&<div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}

        {active==='overview'&&<section>
          {loading?<Loading/>:<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metricsCards.map(metric=>{const Icon=metric.icon;return <button key={metric.label} onClick={()=>setActive(metric.link)} className={`${card} group p-4 text-left transition hover:border-lime-300/20 hover:bg-[#141d29]`}><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{metric.label}</span><Icon size={18} className="text-lime-300"/></div><p className="mt-4 text-2xl font-black">{typeof metric.value==='number'?metric.value.toLocaleString('en-IN'):metric.value}</p></button>})}</div>
            <div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_1fr]"><section className={`${card} p-5`}><div className="flex items-center justify-between"><div><h2 className="font-bold">Booking activity</h2><p className="mt-1 text-xs text-slate-500">Bookings grouped by month from current platform records</p></div><CalendarDays size={18} className="text-lime-300"/></div><BookingTrend rows={rows}/></section><section className={`${card} p-5`}><h2 className="font-bold">Needs attention</h2><p className="mt-1 text-xs text-slate-500">Open queues from the live platform data</p><div className="mt-4 space-y-3"><QueueLink label="Owner applications & turf approvals" count={metrics.owners} onClick={()=>setActive('owners')}/><QueueLink label="Refunds pending / processing" count={metrics.refunds_pending} onClick={()=>setActive('refunds')}/><QueueLink label="Unresolved support tickets" count={metrics.complaints_open} onClick={()=>setActive('support')}/></div><p className="mt-5 border-t border-white/[.06] pt-4 text-xs leading-5 text-slate-500">Revenue is the sum of successful payment records. Refund processing must be completed with the payment provider before adding its reference here.</p></section></div>
            <div className="mt-6"><h2 className="mb-3 text-sm font-bold text-slate-300">Quick access</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{navItems.filter(item=>!['overview','reports'].includes(item.key)).map(item=>{const Icon=item.icon;return <button key={item.key} onClick={()=>setActive(item.key)} className={`${card} flex items-center gap-3 p-3 text-left text-sm text-slate-300 hover:text-white`}><Icon size={17} className="text-lime-300"/>{item.label}</button>})}</div></div>
          </>}
        </section>}

        {active==='reports'&&<section>{loading?<Loading/>:<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricsCards.slice(0,8).map(metric=>{const Icon=metric.icon;return <div key={metric.label} className={`${card} p-4`}><div className="flex items-center justify-between text-xs text-slate-500">{metric.label}<Icon size={16} className="text-lime-300"/></div><p className="mt-3 text-2xl font-black">{typeof metric.value==='number'?metric.value.toLocaleString('en-IN'):metric.value}</p></div>})}</div><section className={`${card} mt-5 p-5`}><h2 className="font-bold">Monthly booking performance</h2><BookingTrend rows={rows}/></section><section className={`${card} mt-5 overflow-hidden`}><div className="border-b border-white/[.06] p-5"><h2 className="font-bold">Recent bookings for reporting</h2><p className="mt-1 text-xs text-slate-500">Latest 1,000 booking records (dashboard totals use database counts).</p></div><DataTable rows={rows.slice(0,30)} columns={['booking_date','booking_status','final_amount','created_at']}/></section></>}</section>}

        {config&&active!=='overview'&&active!=='reports'&&<section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] p-4 sm:p-5"><div><h2 className="font-bold">{config.title}</h2><p className="mt-1 text-xs text-slate-500">{rows.length} loaded · showing up to 250 records</p></div><div className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#0b1018] px-3 sm:w-72"><Search size={16} className="shrink-0 text-slate-500"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search loaded records..." className="w-full bg-transparent py-2.5 text-sm outline-none"/></div></div>
          {loading ? <Loading /> : filteredRows.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList size={28} className="mx-auto text-slate-600" />
              <h3 className="mt-3 font-semibold">No records found</h3>
              <p className="mt-1 text-sm text-slate-500">{query ? 'Try another search.' : 'There are no records in this section yet.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                rows={filteredRows}
                columns={config.columns}
                actions={(row, index) => (
                  <ActionButtons
                    active={active}
                    row={row}
                    index={index}
                    onStatus={(status, label) => askStatus(row, status, label)}
                    onEdit={column => void editSimple(row, column)}
                    onStaffEdit={() => editStaff(row)}
                  />
                )}
              />
            </div>
          )}
        </section>}
      </main>
    </div>

    {formOpen&&<div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"><form onSubmit={createRecord} className={`${card} my-6 max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 shadow-2xl sm:p-7`}><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime-300">Admin action</p><h2 className="mt-1 text-xl font-bold">{active==='staff'?'Add or assign staff':active==='notifications'?'Send notification':active==='blockedSlots'?'Block turf slot':`Create ${config?.title||'record'}`}</h2></div><button type="button" onClick={()=>setFormOpen(false)} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X size={18}/></button></div><div className="space-y-4">{fieldsFor(active).map(field=><label key={field.name} className="block text-sm text-slate-400">{field.label}{active==='staff'&&field.name==='user_id'?<select required value={form.user_id||''} onChange={event=>setForm(current=>({...current,user_id:event.target.value}))} className={`${inputClass} mt-1.5`}><option value="">Select an account</option>{staffCandidates.map(candidate=><option key={candidate.user_id} value={candidate.user_id}>{candidate.full_name||candidate.email||candidate.user_id} · {candidate.role}</option>)}</select>:<input type={field.type||'text'} required={field.required} value={form[field.name]||''} onChange={event=>setForm(current=>({...current,[field.name]:event.target.value}))} placeholder={field.placeholder||''} className={`${inputClass} mt-1.5`}/>}</label>)}</div>{active==='staff'&&<p className="mt-3 text-xs leading-5 text-amber-200">Staff must already have a registered account. Assigning staff updates the role and turf access; it does not create a password or bypass email verification.</p>}{active==='notifications'&&<p className="mt-3 text-xs text-amber-200">This sends a notification to every account currently assigned the selected role.</p>}{active==='refunds'&&<p className="mt-3 text-xs text-slate-500">Record a refund only after the payment provider confirms it. A provider refund reference is required.</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setFormOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{saving&&<LoaderCircle size={15} className="animate-spin"/>}{active==='notifications'?'Send notification':'Save'}</button></div></form></div>}
  </div>;
}

function Loading(){return <div className="grid min-h-40 place-items-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle size={17} className="animate-spin"/>Loading live Supabase data…</span></div>}

function QueueLink({label,count,onClick}:{label:string;count:number;onClick:()=>void}){return <button onClick={onClick} className="flex w-full items-center justify-between rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-left text-sm hover:border-lime-300/20"><span className="text-slate-300">{label}</span><span className="rounded-full bg-white/[.06] px-2.5 py-1 font-bold">{count}</span></button>}

function DataTable({rows,columns,actions}:{rows:Row[];columns:string[];actions?:(row:Row,index:number)=>React.ReactNode}){
  return <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[.025] text-[10px] uppercase tracking-[.12em] text-slate-500"><tr>{columns.map(column=><th key={column} className="px-4 py-3 font-bold">{displayLabel(column)}</th>)}{actions&&<th className="px-4 py-3 font-bold">Actions</th>}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id||row.user_id||row.key||index)} className="border-t border-white/[.05] align-top hover:bg-white/[.015]">{columns.map(column=><td key={column} className="max-w-64 px-4 py-3 text-slate-300"><span className="line-clamp-3 break-words">{safeString(row[column])}</span></td>)}{actions&&<td className="px-4 py-3">{actions(row,index)}</td>}</tr>)}</tbody></table>;
}

function ActionButtons({active,row,onStatus,onEdit,onStaffEdit}:{active:PanelKey;row:Row;index:number;onStatus:(status:string,label:string)=>void;onEdit:(column:string)=>void;onStaffEdit:(row:Row)=>void}){
  const key=active==='customers'?'id':active==='owners'||active==='staff'?'user_id':active==='settings'?'key':'id';
  const id=uid(row,key);
  const button='rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-lime-300/30 hover:text-white disabled:opacity-40';
  const primary='rounded-lg bg-lime-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-lime-200 disabled:opacity-40';
  const controls:React.ReactNode[]=[];
  const action=(label:string,status:string,style=false)=>controls.push(<button key={label} className={style?primary:button} onClick={()=>onStatus(status,label)}>{label}</button>);
  const edit=(column:string)=>controls.push(<button key={`edit-${column}`} className={button} onClick={()=>onEdit(column)}>Edit {displayLabel(column)}</button>);
  if(active==='customers')action(row.status==='ACTIVE'?'Deactivate':'Activate',row.status==='ACTIVE'?'INACTIVE':'ACTIVE',row.status!=='ACTIVE');
  if(active==='owners'&&row.verification_status==='PENDING'){action('Approve','APPROVED',true);action('Reject','REJECTED')}
  if(active==='staff'){action(row.status==='ACTIVE'?'Deactivate':'Activate',row.status==='ACTIVE'?'INACTIVE':'ACTIVE',row.status!=='ACTIVE');controls.push(<button key="staff-edit" className={button} onClick={()=>onStaffEdit(row)}>Edit assignment</button>)}
  if(active==='turfs'){
    if(row.approval_status==='PENDING'){action('Approve','APPROVED',true);action('Reject','REJECTED')}
    action(row.status==='ACTIVE'?'Block turf':'Unblock turf',row.status==='ACTIVE'?'SUSPENDED':'ACTIVE');
    edit('name');edit('starting_price');
  }
  if(active==='bookings'){
    if(['PENDING','RESCHEDULED'].includes(String(row.booking_status)))action('Confirm','CONFIRMED',true);
    if(['PENDING','CONFIRMED','RESCHEDULED'].includes(String(row.booking_status)))action('Cancel','CANCELLED');
    if(['CONFIRMED','RESCHEDULED'].includes(String(row.booking_status)))action('Mark no-show','NO_SHOW');
    if(['CONFIRMED','RESCHEDULED'].includes(String(row.booking_status)))action('Complete','COMPLETED');
  }
  if(active==='refunds'&&['PENDING','PROCESSING'].includes(String(row.status))){action('In progress','PROCESSING');action('Mark refunded','COMPLETED',true);action('Reject','REJECTED')}
  if(active==='coupons'||active==='membershipPlans')action(row.active?'Disable':'Enable',row.active?'false':'true',!row.active);
  if(active==='reviews'){action(row.approved?'Hide review':'Publish review',row.approved?'HIDDEN':'PUBLISHED',!row.approved);edit('review_text')}
  if(active==='teams')controls.push(<button key="delete" className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[11px] text-red-200" onClick={()=>onStatus('DELETE','Delete team')}>Delete</button>);
  if(active==='membershipUsers')action(row.status==='ACTIVE'?'Expire membership':'Activate membership',row.status==='ACTIVE'?'EXPIRED':'ACTIVE',row.status!=='ACTIVE');
  if(active==='tournaments')edit('name'),action('Open','OPEN',row.status!=='OPEN'),action('Close','CLOSED',row.status==='OPEN');
  if(active==='registrations')controls.push(<button key="remove" className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[11px] text-red-200" onClick={()=>onStatus('DELETE','Remove registration')}>Remove</button>);
  if(active==='matches')controls.push(<button key="scores" className={button} onClick={()=>onStatus('EDIT_SCORE','Edit scores / result')}>Edit score</button>);
  if(active==='maintenance')action(row.status==='ACTIVE'?'Close schedule':'Reopen schedule',row.status==='ACTIVE'?'COMPLETED':'ACTIVE');
  if(active==='blockedSlots')controls.push(<button key="unblock" className={button} onClick={()=>onStatus('DELETE','Unblock time slot')}>Unblock</button>);
  if(active==='support'){
    controls.push(<button key="reply" className={button} onClick={()=>onStatus('REPLY','Reply')}>Reply</button>);
    for(const status of ['IN_REVIEW','RESOLVED','REJECTED'])if(row.status!==status)action(displayLabel(status),status,status==='RESOLVED');
  }
  if(active==='settings')controls.push(<button key="edit" className={button} onClick={()=>onStatus('EDIT_VALUE','Edit setting')}>Edit value</button>);
  if(active==='notifications'&&!row.read_at)controls.push(<button key="read" className={button} onClick={()=>onStatus('READ','Mark read')}>Mark read</button>);
  return <div className="flex max-w-64 flex-wrap gap-1.5">{controls.length?controls:<span className="text-slate-600">—</span>}</div>;
}

function BookingTrend({rows}:{rows:Row[]}){
  const values=new Map<string,number>();
  for(const row of rows){
    const raw=String(row.booking_date||'');
    if(!raw)continue;
    const date=new Date(`${raw.slice(0,10)}T00:00:00`);
    if(Number.isNaN(date.getTime()))continue;
    const key=date.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
    values.set(key,(values.get(key)||0)+1);
  }
  const chart=[...values.entries()].slice(0,8).reverse();
  const maximum=Math.max(1,...chart.map(([,value])=>value));
  return chart.length?<div className="mt-5 flex h-48 items-end gap-2">{chart.map(([label,value])=><div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] text-slate-400">{value}</span><div title={`${label}: ${value} bookings`} className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-lime-500/40 to-lime-300" style={{height:`${Math.max(6,value/maximum*78)}%`}}/><span className="text-[9px] text-slate-600">{label}</span></div>)}</div>:<div className="grid h-48 place-items-center text-sm text-slate-600">No booking activity to chart.</div>;
}
