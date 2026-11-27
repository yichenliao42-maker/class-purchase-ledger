import { fetchCompleteRecords, sameBackupRecords } from './closure-helpers.js';

export function setupClosure({ client, getUser, refresh, escape, today }) {
  const $ = selector => document.querySelector(selector);
  let currentClass = '', snapshot = null, verified = false, busy = false;
  const dialog = $('#closureDialog'), message = $('#closureMessage');
  const status = (text, error=false) => { message.textContent=text; message.style.color=error?'#b74e3e':'#527464'; };
  function invalidate() { $('#closurePreview').hidden=true; $('#closurePreviewList').replaceChildren(); verified=false; $('#closureConfirm').checked=false; $('#closureName').value=''; $('#closureSubmit').disabled=true; }
  function syncSubmit() { $('#closureSubmit').disabled=busy || !verified || !snapshot || !snapshot.targets.length || !$('#closureConfirm').checked || $('#closureName').value.trim()!==currentClass; }
  async function fresh() { const user=getUser(); if(!user)throw new Error('請先登入'); const rows=await fetchCompleteRecords(client,user.id); return {owner:user.id,rows}; }
  function listTargets(rows) { const matches=rows.filter(({data})=>Array.isArray(data?.shares)&&data.shares.some(s=>s.name===currentClass)); return {targets:matches.filter(({data})=>data.shares.length===1), shared:matches.filter(({data})=>data.shares.length!==1)}; }
  $('#closeClassBtn').onclick=async()=>{
    const chosen=$('#filterClass').value;
    if(!chosen){alert('請先在班級選單選擇要結案的班級。');return}
    currentClass=chosen;snapshot=null;invalidate();$('#closureFile').value='';$('#closureClass').textContent=chosen;$('#closureCounts').textContent='正在讀取雲端資料…';status('');dialog.showModal();
    try { const value=await fresh(); const groups=listTargets(value.rows); snapshot={...value,...groups}; $('#closureCounts').textContent=`可刪除 ${groups.targets.length} 筆僅屬於此班的紀錄；${groups.shared.length} 筆共同採購將保留。`;if(!groups.targets.length)status('此班目前沒有可刪除的單班紀錄。'); }
    catch {snapshot=null;$('#closureCounts').textContent='';status('讀取雲端資料失敗，請確認網路並重新開啟結案。',true)}
  };
  $('#closureDownload').onclick=async()=>{
    if(!snapshot||busy)return;
    try { const now=await fresh();if(now.owner!==snapshot.owner)throw Error('account');const groups=listTargets(now.rows);snapshot={...now,...groups};invalidate();$('#closureFile').value='';$('#closureCounts').textContent=`可刪除 ${groups.targets.length} 筆僅屬於此班的紀錄；${groups.shared.length} 筆共同採購將保留。`;
      const data=JSON.stringify({version:1,records:now.rows.map(r=>r.data)});const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`班級採購完整備份-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('請開啟剛下載的備份並確認資料及照片，再選取該檔案核對。');
    } catch {status('備份失敗，請檢查網路後重試；資料尚未刪除。',true)}
  };
  $('#closureFile').onchange=async e=>{
    invalidate();const file=e.target.files[0];if(!file||!snapshot)return;
    try {const parsed=JSON.parse(await file.text());const now=await fresh();if(now.owner!==snapshot.owner || !sameBackupRecords(parsed,now.rows.map(r=>r.data)))throw Error('mismatch');const groups=listTargets(now.rows);snapshot={...now,...groups};verified=true;const preview=$('#closurePreviewList');preview.replaceChildren();for(const rec of parsed.records){const box=document.createElement('div');box.className='backup-preview-item';const label=document.createElement('p');label.textContent=(rec.date||'')+'　'+(rec.item||'未命名')+'　'+(rec.shares||[]).map(x=>x.name).join('、');box.appendChild(label);if(rec.photo){const img=document.createElement('img');img.src=rec.photo;img.alt=(rec.item||'採購紀錄')+'的備份照片';img.loading='lazy';box.appendChild(img)}preview.appendChild(box)}$('#closurePreviewSummary').textContent=`共 ${parsed.records.length} 筆紀錄，含 ${parsed.records.filter(r=>r.photo).length} 張照片`;$('#closurePreview').hidden=false;$('#closureCounts').textContent=`可刪除 ${groups.targets.length} 筆僅屬於此班的紀錄；${groups.shared.length} 筆共同採購將保留。`;status('備份內容與目前雲端資料一致。請展開預覽確認紀錄及照片，再輸入班級名稱。');syncSubmit();}
    catch {snapshot=null;status('備份無法核對，或雲端資料已變動。請關閉後重新開啟結案並重新備份。',true)}
  };
  $('#closureConfirm').onchange=syncSubmit;$('#closureName').oninput=syncSubmit;
  $('#closureSubmit').onclick=async()=>{
    if(busy||!verified||!snapshot||!snapshot.targets.length||!$('#closureConfirm').checked||$('#closureName').value.trim()!==currentClass)return;
    if(!confirm(`確定結案「${currentClass}」？將刪除 ${snapshot.targets.length} 筆單班紀錄及其照片，${snapshot.shared.length} 筆共同採購保留。此操作無法復原，是否繼續？`))return;
    busy=true;syncSubmit();let deleted=0;
    try {
      const now=await fresh();if(now.owner!==snapshot.owner || !sameBackupRecords({version:1,records:snapshot.rows.map(r=>r.data)},now.rows.map(r=>r.data)))throw Error('資料已有變動，請重新備份。');
      for(const row of snapshot.targets){const {data,error}=await client.from('class_purchase_browser_records').delete().eq('owner',snapshot.owner).eq('id',row.id).eq('updated_at',row.updated_at).select('id');if(error)throw error;if(!data||data.length!==1)throw Error('資料已變動或刪除未完成，請重新整理並檢查。');deleted++;}
      await refresh();dialog.close();alert(`結案完成：已刪除 ${deleted} 筆單班紀錄及其照片。${snapshot.shared.length} 筆共同採購保留。`);
    } catch(e) {invalidate();status(`結案未全部完成：已刪除 ${deleted} 筆。${e?.message||'請檢查網路後重試。'}請以備份還原或重新開啟結案。`,true);await refresh();}
    finally {busy=false;syncSubmit();}
  };
}
