// Mr RobotyBR — Admin Panel SPA
const API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://chatbot20agent-agentprojetcnew.up.railway.app'
const GROQ_MODELS = ['llama-3.3-70b-versatile','llama-3.1-70b-versatile','llama-3.1-8b-instant','llama-3.2-11b-vision-preview','mixtral-8x7b-32768','gemma2-9b-it']
let state = { lojas: [], lojaId: null, loja: null, page: 'dashboard' }
let waPolling = null

const api = {
  async get(p) { const r = await fetch(API+p); if(!r.ok) throw new Error('HTTP '+r.status); return r.json() },
  async post(p,b) { const r = await fetch(API+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.erro||'HTTP '+r.status)} return r.json() },
  async patch(p,b) { const r = await fetch(API+p,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.erro||'HTTP '+r.status)} return r.json() },
  async del(p) { const r = await fetch(API+p,{method:'DELETE'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json() },
  async upload(p,fd) { const r = await fetch(API+p,{method:'POST',body:fd}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.erro||'HTTP '+r.status)} return r.json() },
}

function toast(msg,type='success'){const el=document.createElement('div');el.className='toast toast-'+type;el.textContent=msg;document.getElementById('toastContainer').appendChild(el);setTimeout(()=>el.remove(),3500)}
function openModal(h){document.getElementById('modalContent').innerHTML=h;document.getElementById('modalOverlay').classList.add('active')}
function closeModal(){document.getElementById('modalOverlay').classList.remove('active')}
document.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()})
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebarOverlay').classList.toggle('active')}

function populateLojaSelect(){
  const s=document.getElementById('lojaSelect')
  s.innerHTML=state.lojas.length?state.lojas.map(l=>'<option value="'+l.id+'"'+(l.id===state.lojaId?' selected':'')+'>'+l.nome+'</option>').join(''):'<option value="">Nenhum cliente</option>'
}
function onLojaChange(){
  state.lojaId=document.getElementById('lojaSelect').value
  state.loja=state.lojas.find(l=>l.id===state.lojaId)||null
  document.getElementById('lojaNameTopbar').textContent=state.loja?state.loja.nome:''
  navigate(state.page)
}

const TITLES={dashboard:'Dashboard',agente:'Agente & Prompt',rag:'Base de Conhecimento',conversas:'Conversas',whatsapp:'Conexao WhatsApp',clientes:'Gerenciar Clientes'}

function navigate(page){
  if(waPolling&&page!=='whatsapp'){clearInterval(waPolling);waPolling=null}
  state.page=page
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'))
  var el=document.querySelector('[data-page="'+page+'"]');if(el)el.classList.add('active')
  document.getElementById('pageTitle').textContent=TITLES[page]||page
  document.getElementById('pageContent').innerHTML='<div class="spinner"></div>'
  var pages={dashboard:renderDashboard,agente:renderAgente,rag:renderRAG,conversas:renderConversas,whatsapp:renderWhatsApp,clientes:renderClientes}
  ;(pages[page]||renderDashboard)()
}

async function checkServer(){
  try{const d=await api.get('/status');document.getElementById('serverDot').className='status-dot online';document.getElementById('serverStatusText').textContent='Online - '+(d.instancias?d.instancias.length:0)+' instancias'}
  catch(e){document.getElementById('serverDot').className='status-dot';document.getElementById('serverStatusText').textContent='Servidor offline'}
}

function noLojaMsg(){return '<div class="empty-state"><div class="empty-icon">&#x1F465;</div><p>Selecione ou crie um cliente para comecar</p><button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'clientes\')">+ Criar Cliente</button></div>'}
function errMsg(e){return '<div class="empty-state"><div class="empty-icon">&#x26A0;</div><p>Erro: '+e.message+'</p></div>'}

// === DASHBOARD ===
async function renderDashboard(){
  var c=document.getElementById('pageContent')
  if(!state.lojaId){c.innerHTML=noLojaMsg();return}
  try{
    var stats=await api.get('/admin/lojas/'+state.lojaId+'/stats')
    var wa=await api.get('/wa/status/'+state.lojaId)
    var waLabel=wa.status==='conectado'?'Conectado ('+wa.numero+')':(wa.status||'Desconectado')
    c.innerHTML='<div class="stats-grid">'+
      '<div class="stat-card"><span class="stat-icon">&#x1F4AC;</span><div class="stat-label">Conversas Hoje</div><div class="stat-value">'+(stats.conversasHoje||0)+'</div></div>'+
      '<div class="stat-card"><span class="stat-icon">&#x1F4CB;</span><div class="stat-label">Pedidos Pendentes</div><div class="stat-value">'+(stats.pedidosPendentes||0)+'</div></div>'+
      '<div class="stat-card"><span class="stat-icon">&#x1F4DA;</span><div class="stat-label">Docs RAG</div><div class="stat-value">'+(stats.totalProdutos||0)+'</div></div>'+
      '<div class="stat-card"><span class="stat-icon">&#x1F4F1;</span><div class="stat-label">WhatsApp</div><div class="stat-value" style="font-size:14px;margin-top:8px">'+waLabel+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><span class="card-title">Conversas Recentes</span><button class="btn btn-secondary btn-sm" onclick="renderDashboard()">Atualizar</button></div><div id="dashConv"><div class="spinner"></div></div></div>'
    try{
      var msgs=await api.get('/admin/conversas/'+state.lojaId+'/recentes')
      var el=document.getElementById('dashConv')
      if(!msgs.length){el.innerHTML='<div class="empty-state"><p>Sem conversas recentes</p></div>';return}
      el.innerHTML='<div class="table-wrap"><table><thead><tr><th>Contato</th><th>Mensagem</th><th>Papel</th><th>Hora</th></tr></thead><tbody>'+
        msgs.map(function(m){return '<tr><td>'+(m.nome_cliente||m.numero_cliente||'-')+'</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+m.content+'</td><td><span class="badge '+(m.role==='user'?'badge-info':'badge-success')+'">'+m.role+'</span></td><td>'+new Date(m.created_at).toLocaleTimeString('pt-BR')+'</td></tr>'}).join('')+
      '</tbody></table></div>'
    }catch(e2){document.getElementById('dashConv').innerHTML='<p style="color:var(--text-muted);padding:16px">Erro ao carregar conversas</p>'}
  }catch(err){c.innerHTML=errMsg(err)}
}

// === AGENTE & PROMPT ===
async function renderAgente(){
  var c=document.getElementById('pageContent')
  if(!state.lojaId){c.innerHTML=noLojaMsg();return}
  try{
    var loja=await api.get('/admin/lojas/'+state.lojaId)
    var temp=loja.llm_temperature!=null?loja.llm_temperature:0.7
    var maxTok=loja.llm_max_tokens||512
    var model=loja.llm_model||GROQ_MODELS[0]
    c.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'+
      '<div><div class="card"><div class="card-title" style="margin-bottom:16px">Prompt do Agente</div>'+
        '<div class="form-group"><label class="form-label">Prompt Base (System Prompt)</label><textarea class="form-textarea" id="promptBase" style="min-height:180px">'+(loja.prompt_base||'')+'</textarea></div>'+
        '<div class="form-group"><label class="form-label">Instrucoes Extras</label><textarea class="form-textarea" id="instrExtras" style="min-height:100px">'+(loja.instrucoes_extras||'')+'</textarea></div>'+
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><label class="form-label" style="margin:0">Bot Ativo</label><label class="toggle"><input type="checkbox" id="botAtivo"'+(loja.ativa?' checked':'')+'><span class="toggle-slider"></span></label></div>'+
        '<button class="btn btn-primary" onclick="salvarAgente()">Salvar Configuracoes</button></div></div>'+
      '<div><div class="card"><div class="card-title" style="margin-bottom:16px">Configuracao do LLM (Groq)</div>'+
        '<div class="form-group"><label class="form-label">Modelo</label><select class="form-select" id="llmModel">'+GROQ_MODELS.map(function(m){return '<option value="'+m+'"'+(m===model?' selected':'')+'>'+m+'</option>'}).join('')+'</select></div>'+
        '<div class="form-group"><label class="form-label">Temperatura - <span class="range-value" id="tempVal">'+temp+'</span></label><input type="range" id="llmTemp" min="0" max="2" step="0.1" value="'+temp+'" oninput="document.getElementById(\'tempVal\').textContent=this.value"><p style="font-size:11px;color:var(--text-muted);margin-top:4px">0 = deterministico - 1 = balanceado - 2 = criativo</p></div>'+
        '<div class="form-group"><label class="form-label">Max Tokens - <span class="range-value" id="tokVal">'+maxTok+'</span></label><input type="range" id="llmMaxTokens" min="128" max="4096" step="64" value="'+maxTok+'" oninput="document.getElementById(\'tokVal\').textContent=this.value"></div>'+
        '<button class="btn btn-primary" onclick="salvarLLM()">Salvar LLM</button></div>'+
      '<div class="card"><div class="card-title" style="margin-bottom:16px">Testar Agente</div>'+
        '<div class="form-group"><label class="form-label">Numero (simulado)</label><input class="form-input" id="simPhone" value="5511999999999"></div>'+
        '<div class="form-group"><label class="form-label">Mensagem</label><input class="form-input" id="simText" placeholder="Digite uma mensagem de teste..."></div>'+
        '<button class="btn btn-secondary" onclick="testarAgente()" id="btnSim" style="margin-bottom:12px">Enviar Teste</button>'+
        '<div id="simResult" style="display:none;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-size:13px;line-height:1.6"></div></div></div></div>'
  }catch(err){c.innerHTML=errMsg(err)}
}

async function salvarAgente(){
  try{await api.patch('/admin/lojas/'+state.lojaId,{prompt_base:document.getElementById('promptBase').value,instrucoes_extras:document.getElementById('instrExtras').value,ativa:document.getElementById('botAtivo').checked});toast('Agente salvo com sucesso!')}
  catch(err){toast(err.message,'error')}
}
async function salvarLLM(){
  try{await api.patch('/admin/lojas/'+state.lojaId,{llm_model:document.getElementById('llmModel').value,llm_temperature:parseFloat(document.getElementById('llmTemp').value),llm_max_tokens:parseInt(document.getElementById('llmMaxTokens').value)});toast('Configuracao LLM salva!')}
  catch(err){toast(err.message,'error')}
}
async function testarAgente(){
  var phone=document.getElementById('simPhone').value,text=document.getElementById('simText').value
  if(!text){toast('Digite uma mensagem','error');return}
  var btn=document.getElementById('btnSim');btn.textContent='Aguardando...';btn.disabled=true
  try{var r=await api.post('/simulate',{phone:phone,text:text,loja_id:state.lojaId});var el=document.getElementById('simResult');el.style.display='block';el.textContent=r.reply||r.erro||'Sem resposta'}
  catch(err){toast(err.message,'error')}
  finally{btn.textContent='Enviar Teste';btn.disabled=false}
}

// === RAG ===
async function renderRAG(){
  var c=document.getElementById('pageContent')
  if(!state.lojaId){c.innerHTML=noLojaMsg();return}
  c.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'+
    '<div><div class="card"><div class="card-title" style="margin-bottom:16px">Upload de Arquivo</div>'+
      '<div class="upload-zone" id="uploadZone" onclick="document.getElementById(\'ragFile\').click()">'+
        '<div style="font-size:32px;margin-bottom:8px">&#x1F4C1;</div>'+
        '<p style="font-weight:600">Clique ou arraste o arquivo aqui</p>'+
        '<p style="font-size:12px;color:var(--text-muted);margin-top:4px">PDF, XLSX suportados</p>'+
        '<input type="file" id="ragFile" accept=".pdf,.xlsx,.xls" style="display:none" onchange="uploadRAG()">'+
      '</div></div>'+
    '<div class="card"><div class="card-title" style="margin-bottom:16px">Importar Link</div>'+
      '<div class="form-group"><label class="form-label">URL do Site</label><input class="form-input" id="ragLink" placeholder="https://seusite.com.br/pagina"></div>'+
      '<button class="btn btn-primary" onclick="importarLink()">Importar Conteudo</button></div></div>'+
    '<div class="card" style="height:fit-content"><div class="card-header"><span class="card-title">Documentos Carregados</span><button class="btn btn-secondary btn-sm" onclick="renderRAG()">Atualizar</button></div><div id="ragList"><div class="spinner"></div></div></div></div>'
  loadRAGDocs()
}
async function loadRAGDocs(){
  try{var docs=await api.get('/cliente/rag/'+state.lojaId);var el=document.getElementById('ragList')
    if(!docs.length){el.innerHTML='<div class="empty-state"><p>Nenhum documento carregado</p></div>';return}
    el.innerHTML=docs.map(function(d){return '<div class="doc-item"><div style="display:flex;align-items:center;flex:1;min-width:0"><span class="doc-icon">'+(d.tipo==='arquivo'?'&#x1F4C4;':'&#x1F517;')+'</span><div style="min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+d.titulo+'</div><div style="font-size:11px;color:var(--text-muted)">'+d.tipo+'</div></div></div><button class="btn btn-danger btn-sm" onclick="deletarDoc(\''+d.id+'\')">Remover</button></div>'}).join('')
  }catch(e){document.getElementById('ragList').innerHTML='<p style="color:var(--text-muted);padding:16px">Erro ao carregar</p>'}
}
async function uploadRAG(){
  var file=document.getElementById('ragFile').files[0];if(!file)return
  try{var fd=new FormData();fd.append('file',file);fd.append('loja_id',state.lojaId);await api.upload('/cliente/upload',fd);toast('Arquivo enviado!');loadRAGDocs()}
  catch(err){toast(err.message,'error')}
}
async function importarLink(){
  var url=document.getElementById('ragLink').value.trim();if(!url){toast('Digite uma URL','error');return}
  try{await api.post('/cliente/importar-link',{url:url,loja_id:state.lojaId});toast('Link importado!');document.getElementById('ragLink').value='';loadRAGDocs()}
  catch(err){toast(err.message,'error')}
}
async function deletarDoc(id){
  if(!confirm('Remover este documento?'))return
  try{await api.del('/cliente/rag/'+id);toast('Documento removido!');loadRAGDocs()}catch(err){toast(err.message,'error')}
}

// === CONVERSAS ===
async function renderConversas(){
  var c=document.getElementById('pageContent')
  if(!state.lojaId){c.innerHTML=noLojaMsg();return}
  c.innerHTML='<div class="chat-container" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)">'+
    '<div class="chat-contacts" id="contactList"><div class="spinner"></div></div>'+
    '<div class="chat-messages" id="chatPanel"><div class="empty-state" style="margin:auto"><p>Selecione um contato</p></div></div></div>'
  loadContatos()
}
async function loadContatos(){
  try{var ct=await api.get('/admin/conversas/'+state.lojaId+'/contatos');var el=document.getElementById('contactList')
    if(!ct.length){el.innerHTML='<div class="empty-state" style="padding:40px 16px"><p>Sem contatos</p></div>';return}
    el.innerHTML=ct.map(function(c){var n=c.nome||c.numero;return '<div class="contact-item" onclick="openChat(\''+c.numero+'\',\''+n.replace(/'/g,'').replace(/"/g,'')+'\')">'+'<div class="contact-avatar">'+n[0].toUpperCase()+'</div><div class="contact-info"><div class="contact-name">'+n+'</div><div class="contact-last">'+(c.ultima||'...')+'</div></div></div>'}).join('')
  }catch(e){document.getElementById('contactList').innerHTML='<p style="color:var(--text-muted);padding:16px">Erro</p>'}
}
async function openChat(numero,nome){
  var panel=document.getElementById('chatPanel')
  panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border)"><div><div style="font-weight:600">'+nome+'</div><div style="font-size:12px;color:var(--text-muted)">'+numero+'</div></div><button class="btn btn-danger btn-sm" onclick="deletarConversa(\''+numero+'\',\''+nome+'\')">Limpar</button></div><div class="chat-messages-body" id="msgBody" style="display:flex;flex-direction:column"><div class="spinner"></div></div>'
  try{var msgs=await api.get('/admin/conversas/'+state.lojaId+'/'+numero);var body=document.getElementById('msgBody')
    if(!msgs.length){body.innerHTML='<div class="empty-state"><p>Sem mensagens</p></div>';return}
    body.innerHTML=msgs.map(function(m){return '<div style="display:flex;flex-direction:column;align-items:'+(m.role==='user'?'flex-start':'flex-end')+'"><div class="message-bubble message-'+m.role+'">'+String(m.content).replace(/</g,'&lt;')+'</div><div class="message-time">'+new Date(m.created_at).toLocaleTimeString('pt-BR')+'</div></div>'}).join('')
    body.scrollTop=body.scrollHeight
  }catch(e){document.getElementById('msgBody').innerHTML='<p style="color:var(--text-muted);padding:16px">Erro ao carregar</p>'}
}
async function deletarConversa(numero,nome){
  if(!confirm('Apagar conversa com '+nome+'?'))return
  try{await api.del('/admin/conversas/'+state.lojaId+'/'+numero);toast('Conversa apagada!');renderConversas()}catch(err){toast(err.message,'error')}
}

// === WHATSAPP ===
async function renderWhatsApp(){
  var c=document.getElementById('pageContent')
  if(!state.lojaId){c.innerHTML=noLojaMsg();return}
  if(waPolling){clearInterval(waPolling);waPolling=null}
  c.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">'+
    '<div class="card wa-status-card" id="waStatusCard"><div class="spinner"></div></div>'+
    '<div><div class="card"><div class="card-title" style="margin-bottom:16px">Conectar Numero</div>'+
      '<div class="form-group"><label class="form-label">Numero do WhatsApp</label><input class="form-input" id="waNumero" placeholder="5511999999999 (com DDI e DDD)"></div>'+
      '<button class="btn btn-primary" onclick="conectarWA()" id="btnWA">Gerar Codigo de Pareamento</button></div>'+
    '<div class="card"><div class="card-title" style="margin-bottom:12px">Todas as Instancias</div><div id="waInstances"><div class="spinner"></div></div></div></div></div>'
  loadWAStatus();loadWAInstances();waPolling=setInterval(loadWAStatus,4000)
}
async function loadWAStatus(){
  try{var wa=await api.get('/wa/status/'+state.lojaId);var card=document.getElementById('waStatusCard')
    if(!card){clearInterval(waPolling);waPolling=null;return}
    var labels={conectado:'Conectado',pairing_code:'Aguardando Pareamento',desconectado:'Desconectado',aguardando:'Aguardando',erro:'Erro'}
    var colors={conectado:'var(--success)',pairing_code:'var(--warning)',desconectado:'var(--danger)',aguardando:'var(--text-muted)',erro:'var(--danger)'}
    card.innerHTML='<div class="wa-status-icon">'+(wa.status==='conectado'?'&#x2705;':wa.status==='pairing_code'?'&#x23F3;':'&#x274C;')+'</div>'+
      '<div style="font-size:20px;font-weight:700;color:'+(colors[wa.status]||'var(--text-primary)')+'">'+(labels[wa.status]||wa.status||'Desconhecido')+'</div>'+
      (wa.numero?'<div style="font-size:14px;color:var(--text-secondary);margin:8px 0">Numero: '+wa.numero+'</div>':'')+
      (wa.pairingCode?'<div class="pairing-code">'+wa.pairingCode+'</div><p style="font-size:12px;color:var(--text-muted)">Abra WhatsApp > Dispositivos Conectados > Conectar > Codigo</p>':'')+
      (wa.erro?'<div style="font-size:12px;color:var(--danger);margin:8px 0">'+wa.erro+'</div>':'')+
      (wa.status==='conectado'?'<button class="btn btn-danger" style="margin-top:16px" onclick="desconectarWA()">Desconectar</button>':'')
  }catch(e){}
}
async function loadWAInstances(){
  try{var insts=await api.get('/wa/instances');var el=document.getElementById('waInstances');if(!el)return
    if(!insts.length){el.innerHTML='<p style="color:var(--text-muted);font-size:13px">Nenhuma instancia ativa</p>';return}
    el.innerHTML=insts.map(function(i){return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px"><div><div style="font-size:13px;font-weight:600">Loja '+i.lojaId+'</div><div style="font-size:12px;color:var(--text-muted)">'+(i.numero||'sem numero')+'</div></div><span class="badge '+(i.status==='conectado'?'badge-success':i.status==='pairing_code'?'badge-warning':'badge-danger')+'">'+i.status+'</span></div>'}).join('')
  }catch(e){}
}
async function conectarWA(){
  var numero=document.getElementById('waNumero').value.replace(/\D/g,'');if(!numero){toast('Digite o numero','error');return}
  var btn=document.getElementById('btnWA');btn.textContent='Conectando...';btn.disabled=true
  try{var r=await api.post('/wa/connect',{loja_id:state.lojaId,numero:numero});if(r.pairingCode)toast('Codigo gerado: '+r.pairingCode);else if(r.status==='ja_conectado')toast('Ja esta conectado!');else toast('Solicitacao enviada!')}
  catch(err){toast(err.message,'error')}finally{btn.textContent='Gerar Codigo de Pareamento';btn.disabled=false}
}
async function desconectarWA(){
  if(!confirm('Desconectar o WhatsApp desta loja?'))return
  try{await api.post('/wa/disconnect/'+state.lojaId,{deletar_sessao:true});toast('Desconectado!');loadWAStatus()}catch(err){toast(err.message,'error')}
}

// === CLIENTES ===
async function renderClientes(){
  document.getElementById('pageContent').innerHTML='<div class="card"><div class="card-header"><span class="card-title">Clientes / Lojas</span><button class="btn btn-primary btn-sm" onclick="openModalNovaLoja()">+ Nova Loja</button></div><div id="clientesList"><div class="spinner"></div></div></div>'
  loadClientes()
}
async function loadClientes(){
  try{var lojas=await api.get('/admin/lojas');var el=document.getElementById('clientesList')
    if(!lojas.length){el.innerHTML='<div class="empty-state"><p>Nenhum cliente cadastrado</p></div>';return}
    el.innerHTML='<div class="table-wrap"><table><thead><tr><th>Nome</th><th>WA ID</th><th>Modelo LLM</th><th>Status</th><th>Acoes</th></tr></thead><tbody>'+
      lojas.map(function(l){return '<tr><td style="font-weight:600;color:var(--text-primary)">'+l.nome+'</td><td style="font-family:monospace;font-size:12px">'+(l.wa_id||'-')+'</td><td style="font-size:12px">'+(l.llm_model||'padrao')+'</td><td><span class="badge '+(l.ativa?'badge-success':'badge-danger')+'">'+(l.ativa?'Ativo':'Inativo')+'</span></td><td><button class="btn btn-secondary btn-sm" onclick="editarLoja(\''+l.id+'\')">Editar</button></td></tr>'}).join('')+
    '</tbody></table></div>'
  }catch(err){document.getElementById('clientesList').innerHTML=errMsg(err)}
}
function openModalNovaLoja(){
  openModal('<div class="modal-title">+ Nova Loja / Cliente</div><div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="mNome" placeholder="Ex: Pizzaria do Joao"></div><div class="form-group"><label class="form-label">WA ID (numero sem + nem espacos)</label><input class="form-input" id="mWaId" placeholder="5511999999999"></div><div class="form-group"><label class="form-label">Prompt Base</label><textarea class="form-textarea" id="mPrompt" placeholder="Voce e atendente da loja..."></textarea></div><div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="criarLoja()">Criar Loja</button></div>')
}
async function criarLoja(){
  var nome=document.getElementById('mNome').value.trim(),wa_id=document.getElementById('mWaId').value.trim(),prompt_base=document.getElementById('mPrompt').value.trim()
  if(!nome||!wa_id){toast('Nome e WA ID sao obrigatorios','error');return}
  try{
    var novaLoja = await api.post('/admin/lojas',{nome:nome,wa_id:wa_id,prompt_base:prompt_base});
    toast('Cliente criado! Agora conecte o WhatsApp.');
    closeModal();
    state.lojas=await api.get('/admin/lojas');
    populateLojaSelect();
    
    state.lojaId = novaLoja.id;
    state.loja = state.lojas.find(function(l){return l.id===novaLoja.id}) || novaLoja;
    document.getElementById('lojaSelect').value = state.lojaId;
    document.getElementById('lojaNameTopbar').textContent = state.loja.nome;
    
    navigate('whatsapp');
    setTimeout(function(){
      var waInput = document.getElementById('waNumero');
      if(waInput) waInput.value = wa_id;
    }, 150);
  }
  catch(err){toast(err.message,'error')}
}
async function editarLoja(id){
  try{var loja=await api.get('/admin/lojas/'+id)
    openModal('<div class="modal-title">Editar: '+loja.nome+'</div><div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="mNome" value="'+loja.nome+'"></div><div class="form-group"><label class="form-label">WA ID</label><input class="form-input" id="mWaId" value="'+(loja.wa_id||'')+'"></div><div class="form-group"><label class="form-label">Status</label><label class="toggle" style="display:inline-flex"><input type="checkbox" id="mAtiva"'+(loja.ativa?' checked':'')+'><span class="toggle-slider"></span></label><span style="font-size:13px;color:var(--text-secondary);margin-left:8px">Loja ativa</span></div><div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px"><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="salvarEdicaoLoja(\''+id+'\')">Salvar</button></div>')
  }catch(err){toast(err.message,'error')}
}
async function salvarEdicaoLoja(id){
  try{await api.patch('/admin/lojas/'+id,{nome:document.getElementById('mNome').value,wa_id:document.getElementById('mWaId').value,ativa:document.getElementById('mAtiva').checked});toast('Loja atualizada!');closeModal();state.lojas=await api.get('/admin/lojas');populateLojaSelect();loadClientes()}
  catch(err){toast(err.message,'error')}
}

// === INIT ===
async function init(){
  checkServer();setInterval(checkServer,15000)
  try{var lojas=await api.get('/admin/lojas');state.lojas=lojas;if(lojas.length){state.lojaId=lojas[0].id;state.loja=lojas[0]}populateLojaSelect();document.getElementById('lojaNameTopbar').textContent=state.loja?state.loja.nome:''}
  catch(err){console.error('Erro ao carregar lojas:',err)}
  navigate('dashboard')
}
document.addEventListener('DOMContentLoaded',init)