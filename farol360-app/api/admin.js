// FAROL360 — Administração. Rota: POST /api/admin
// Só o administrador (perfis.papel = 'admin') pode usar. Cria clientes, ajusta saldo,
// define plano (análises liberadas) e ativa/desativa. Tudo com a chave secreta (service_role).

const SB_URL = process.env.SUPABASE_URL || 'https://xjifquevscvkdhnjxqkh.supabase.co';
const ANALISES_VALIDAS = ['empresa', 'governo', 'perfil'];

async function sbUserId(token) {
  const svc = process.env.SUPABASE_SERVICE_ROLE;
  if (!svc || !token) return null;
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: svc, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.id) ? j.id : null;
  } catch (e) { return null; }
}

function svcHeaders() {
  const svc = process.env.SUPABASE_SERVICE_ROLE;
  return { apikey: svc, Authorization: 'Bearer ' + svc, 'content-type': 'application/json' };
}

async function perfilDe(uid) {
  try {
    const r = await fetch(SB_URL + '/rest/v1/perfis?select=id,nome,email,papel,ativo,saldo_centavos,analises,criado_em&id=eq.' + uid, { headers: svcHeaders() });
    if (!r.ok) return null;
    const j = await r.json();
    return (Array.isArray(j) && j[0]) ? j[0] : null;
  } catch (e) { return null; }
}

function limpaAnalises(a) {
  if (!Array.isArray(a)) return [];
  return a.filter(function (x) { return ANALISES_VALIDAS.indexOf(x) >= 0; });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Use POST.' }); return; }
  if (!process.env.SUPABASE_SERVICE_ROLE) { res.status(500).json({ erro: 'SUPABASE_SERVICE_ROLE não configurada no servidor.' }); return; }

  // --- Autentica e exige papel admin ---
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const token = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
  const uid = await sbUserId(token);
  if (!uid) { res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' }); return; }
  const eu = await perfilDe(uid);
  if (!eu || eu.papel !== 'admin') { res.status(403).json({ erro: 'Acesso restrito ao administrador.' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const acao = body.acao || 'listar';

    // ---- LISTAR ----
    if (acao === 'listar') {
      const r = await fetch(SB_URL + '/rest/v1/perfis?select=id,nome,email,papel,ativo,saldo_centavos,analises,criado_em&order=criado_em.desc', { headers: svcHeaders() });
      if (!r.ok) { const t = await r.text(); res.status(502).json({ erro: 'Falha ao listar (HTTP ' + r.status + ').', detalhe: t.slice(0, 200) }); return; }
      const lista = await r.json();
      res.status(200).json({ ok: true, clientes: Array.isArray(lista) ? lista : [] });
      return;
    }

    // ---- CRIAR ----
    if (acao === 'criar') {
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '');
      const nome = String(body.nome || '').trim() || email;
      const saldo = Math.max(0, Math.round(Number(body.saldo_centavos) || 0));
      const analises = limpaAnalises(body.analises);
      if (!email || !senha) { res.status(400).json({ erro: 'Informe e-mail e senha.' }); return; }
      if (senha.length < 6) { res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres.' }); return; }

      // cria o usuário de autenticação (o gatilho cria o perfil automaticamente)
      const rc = await fetch(SB_URL + '/auth/v1/admin/users', {
        method: 'POST', headers: svcHeaders(),
        body: JSON.stringify({ email: email, password: senha, email_confirm: true }),
      });
      const jc = await rc.json();
      if (!rc.ok || !jc.id) {
        const msg = (jc && (jc.msg || jc.error_description || jc.error || jc.message)) || ('HTTP ' + rc.status);
        res.status(400).json({ erro: 'Não foi possível criar o cliente: ' + msg });
        return;
      }
      // completa o perfil (nome, saldo, plano)
      const rp = await fetch(SB_URL + '/rest/v1/perfis?id=eq.' + jc.id, {
        method: 'PATCH', headers: Object.assign({ Prefer: 'return=representation' }, svcHeaders()),
        body: JSON.stringify({ nome: nome, saldo_centavos: saldo, analises: analises, ativo: true }),
      });
      const jp = await rp.json();
      if (!rp.ok) { res.status(502).json({ erro: 'Cliente criado, mas falhou ao definir saldo/plano. Ajuste na lista.', detalhe: JSON.stringify(jp).slice(0, 200) }); return; }
      res.status(200).json({ ok: true, cliente: Array.isArray(jp) ? jp[0] : jp });
      return;
    }

    // ---- ATUALIZAR (saldo, plano, ativo, nome) ----
    if (acao === 'atualizar') {
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ erro: 'Cliente não informado.' }); return; }
      const patch = {};
      if (body.saldo_centavos != null) patch.saldo_centavos = Math.max(0, Math.round(Number(body.saldo_centavos) || 0));
      if (body.analises != null) patch.analises = limpaAnalises(body.analises);
      if (body.ativo != null) patch.ativo = !!body.ativo;
      if (body.nome != null) patch.nome = String(body.nome).trim();
      if (!Object.keys(patch).length) { res.status(400).json({ erro: 'Nada para atualizar.' }); return; }
      const r = await fetch(SB_URL + '/rest/v1/perfis?id=eq.' + id, {
        method: 'PATCH', headers: Object.assign({ Prefer: 'return=representation' }, svcHeaders()),
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) { res.status(502).json({ erro: 'Falha ao atualizar.', detalhe: JSON.stringify(j).slice(0, 200) }); return; }
      res.status(200).json({ ok: true, cliente: Array.isArray(j) ? j[0] : j });
      return;
    }

    // ---- CREDITAR (soma ao saldo atual) ----
    if (acao === 'creditar') {
      const id = String(body.id || '');
      const delta = Math.round(Number(body.delta_centavos) || 0);
      if (!id || !delta) { res.status(400).json({ erro: 'Informe cliente e valor.' }); return; }
      const atual = await perfilDe(id);
      if (!atual) { res.status(404).json({ erro: 'Cliente não encontrado.' }); return; }
      const novo = Math.max(0, (Number(atual.saldo_centavos) || 0) + delta);
      const r = await fetch(SB_URL + '/rest/v1/perfis?id=eq.' + id, {
        method: 'PATCH', headers: Object.assign({ Prefer: 'return=representation' }, svcHeaders()),
        body: JSON.stringify({ saldo_centavos: novo }),
      });
      const j = await r.json();
      if (!r.ok) { res.status(502).json({ erro: 'Falha ao creditar.', detalhe: JSON.stringify(j).slice(0, 200) }); return; }
      res.status(200).json({ ok: true, cliente: Array.isArray(j) ? j[0] : j });
      return;
    }

    res.status(400).json({ erro: 'Ação não reconhecida.' });
  } catch (e) {
    res.status(500).json({ erro: 'Falha interna do administrador.', detalhe: String(e).slice(0, 300) });
  }
}