import { readFile,readdir } from 'node:fs/promises';

// Explicit operator command; builds and application startup never import it.
const apply=process.argv.slice(2).join(' ')==='--apply';
if(process.argv.length>2 && !apply)throw new Error('Use no arguments to inspect, or --apply to migrate.');
try {
  const project=new URL(process.env.SUPABASE_URL);
  if(project.protocol!=='https:' || !/^[a-z]+\.supabase\.co$/.test(project.hostname) || !process.env.SUPABASE_ACCESS_TOKEN)throw new Error('configuration');
  const endpoint=`https://api.supabase.com/v1/projects/${project.hostname.split('.')[0]}/database/query`;
  async function query(sql,readOnly=false){
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:readOnly})});
    if(!response.ok)throw new Error('management request');
    return response.json();
  }
  const directory=new URL('../supabase/migrations/',import.meta.url);
  const files=(await readdir(directory)).filter(name=>/^\d{14}_[a-z_]+\.sql$/.test(name)).sort();
  const table=await query("select to_regclass('supabase_migrations.schema_migrations')::text as name",true);
  const history=table[0].name?await query('select version,name,statements from supabase_migrations.schema_migrations order by version',true):[];
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const pending=[];
  for(const filename of files){
    const version=filename.slice(0,14),name=filename.slice(15,-4),source=await readFile(new URL(filename,directory),'utf8');
    const existing=history.find(row=>row.version===version);
    if(existing){if(existing.name!==name || existing.statements?.length!==1 || existing.statements[0]!==source)throw new Error('migration history differs');}
    else pending.push({version,name,source});
  }
  if(history.some(row=>!files.some(file=>file.startsWith(row.version+'_'))))throw new Error('unrecognized migration history');
  console.log(`Verified migration history; ${pending.length} pending migration(s).`);
  if(!apply || !pending.length)process.exit(0);
  // One transaction includes DDL and exact source history. Advisory lock plus
  // unique version entries protects competing operators; no reset or repair.
  const sql=["begin; select pg_advisory_xact_lock(hashtext('vault-chat-schema'));",
    'create schema if not exists supabase_migrations;',
    'create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);',
    ...pending.flatMap(item=>[item.source,`insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(item.version)},${quote(item.name)},array[${quote(item.source)}]);`]),
    "notify pgrst, 'reload schema'; commit;"];
  await query(sql.join('\n'));
  console.log('Versioned migrations committed atomically; no accounts or keys created.');
}catch{
  console.error('Hosted migration unavailable. Check server environment and migration history; no automatic reset/repair and no credential values are printed.');
  process.exitCode=1;
}
