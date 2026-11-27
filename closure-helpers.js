// Pure backup helpers used by the class closure workflow.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function sameBackupRecords(backup, current) {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.records)) return false;
  if (backup.records.length !== current.length) return false;
  const normalize = rows => rows.map(canonical).sort();
  const a = normalize(backup.records), b = normalize(current);
  return a.every((row,i)=>row===b[i]);
}
export async function fetchCompleteRecords(client, owner, pageSize=500) {
  let all=[];
  for(let start=0;;start+=pageSize) {
    const {data,error}=await client.from('class_purchase_browser_records')
      .select('id,data,updated_at').eq('owner',owner).order('id',{ascending:true}).range(start,start+pageSize-1);
    if(error) throw error;
    all.push(...data);
    if(data.length<pageSize) return all;
  }
}
