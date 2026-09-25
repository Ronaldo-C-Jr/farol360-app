// FAROL360 — Etapa 1: pesquisa na web. Rota: POST /api/pesquisar
// Busca dados reais e devolve os ACHADOS (texto) + as fontes. Rápido, cabe em <60s.

const MODELOS = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-5', opus: 'claude-opus-4-8' };
const SB_URL = process.env.SUPABASE_URL || 'https://xjifquevscvkdhnjxqkh.supabase.co';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Use POST.' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }

  const auth = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const token = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
  const uid = await sbUserId(token);
  if (!uid) { res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const d = body.dados || {};
    // A BUSCA sempre usa um modelo rápido (nunca Opus): ela só reúne fatos.
    // O modelo pesado (Opus) fica reservado para a REDAÇÃO do relatório (/api/analisar).
    // Opus na busca deixava a etapa lenta demais e a conexão do celular caía ("Load failed").
    const modeloBusca = body.modelo === 'haiku' ? 'haiku' : 'sonnet';
    const model = MODELOS[modeloBusca];
    const fontesCliente = d.fontes ? ('\nFontes indicadas pelo cliente: ' + d.fontes) : '';
    const extrasCliente = d.extras ? ('\nDetalhes fornecidos pelo cliente (use para orientar a busca): ' + d.extras) : '';

    let prompt;
    if (body.promptId === 'governo') {
      prompt = 'Pesquise na web dados REAIS e atuais para embasar uma AVALIAÇÃO DE GOVERNO ampla. Faça VÁRIAS buscas e reúna fatos verificáveis.\n\n' +
        'Município/UF: ' + (d.municipio || '') + '\nInstância: ' + (d.instancia || '') + '\nÁrea: ' + (d.area || '') + '\nPeríodo: ' + (d.periodo || '') + fontesCliente + extrasCliente + '\n\n' +
        'Procure VÁRIOS indicadores DISTINTOS da área (não só um): valores do município, do estado e do Brasil para benchmarking (IBGE, DataSUS, INEP, SNIS, Siconfi/Tesouro, Atlas do Desenvolvimento, portal da transparência); evolução ao longo dos anos; notícias sobre a gestão; e contexto socioeconômico local.\n\n' +
        'Escreva um resumo objetivo dos ACHADOS em bullets curtos, cobrindo pelo menos 6 indicadores diferentes; cada achado com o dado, o ano e a fonte. Se algo não for encontrado, escreva "não encontrado". Máximo 30 linhas. NÃO escreva o relatório — só os achados factuais.';
    } else if (body.promptId === 'perfil') {
      prompt = 'Pesquise na web dados REAIS e atuais sobre a figura pública abaixo. Faça buscas objetivas e reúna fatos verificáveis.\n\n' +
        'Figura: ' + (d.figura || '') + '\nPeríodo: ' + (d.periodo || '') + fontesCliente + extrasCliente + '\n\n' +
        'Procure: cargo/partido, mandatos e tentativas, votação e ranking na última eleição, base geográfica de apoio, formação e trajetória, principais bandeiras/temas, presença em redes e notícias, e controvérsias públicas (com neutralidade).\n\n' +
        'Escreva um resumo objetivo dos ACHADOS em bullets curtos; cada achado com o dado e a fonte. Se algo não for encontrado, escreva "não encontrado". Máximo 25 linhas. NÃO escreva o relatório — só os achados factuais.';
    } else {
      prompt = 'Pesquise na web dados REAIS e atuais para embasar uma análise da empresa abaixo. Faça buscas objetivas e reúna fatos verificáveis.\n\n' +
        'Empresa: ' + (d.empresa || '') + '\nSetor: ' + (d.setor || '') + '\nCidade: ' + (d.cidade || '') + fontesCliente + extrasCliente + '\n\n' +
        'Procure: porte/presença da própria empresa; concorrentes nomeados na região; indicadores do setor (IBGE, associações setoriais, notícias econômicas); contexto econômico regional relevante.\n\n' +
        'Escreva um resumo objetivo dos ACHADOS em bullets curtos; cada achado com o dado e a fonte. Se algo não for encontrado, escreva "não encontrado". Máximo 20 linhas. NÃO escreva o relatório — só os achados factuais.';
    }

    const maxUses = body.promptId === 'governo' ? 6 : 4;
    const deadline = Date.now() + 150000;
    const messages = [{ role: 'user', content: prompt }];

    // --- Resposta em STREAMING com heartbeat (correção do iPhone) ---
    // O Safari/WebKit do iOS derruba requisições POST que passam ~60s sem receber
    // nenhum byte. A busca na web pode passar disso; enviar cabeçalhos na hora e um
    // espaço a cada 12s mantém a conexão viva. PC/Android não mudam — o cliente só
    // ignora os espaços antes do JSON. A checagem de sessão (401) acima já respondeu
    // com status normal ANTES deste ponto.
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    try { res.write(' '); } catch (e) {}
    const hb = setInterval(function () { try { res.write(' '); } catch (e) {} }, 12000);
    let encerrado = false;
    function fim(obj) {
      if (encerrado) return; encerrado = true;
      clearInterval(hb);
      try { res.write(JSON.stringify(obj)); } catch (e) {}
      try { res.end(); } catch (e) {}
    }

    try {
      let j = null;
      for (let it = 0; it < 4; it++) {
        const rem = deadline - Date.now();
        if (rem < 4000) break;
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), rem);
        let r;
        try {
          r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', signal: ac.signal,
            headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: model, max_tokens: 2500, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }], messages: messages }),
          });
        } catch (e) { clearTimeout(to); fim({ ok: false, erro: 'A pesquisa na web demorou demais. Tente de novo.' }); return; }
        clearTimeout(to);
        if (!r.ok) { const t = await r.text(); console.error('WS HTTP', r.status, t); fim({ ok: false, erro: 'Busca recusada (HTTP ' + r.status + '): ' + t.slice(0, 300) }); return; }
        j = await r.json();
        if (j.stop_reason === 'pause_turn' && Array.isArray(j.content)) { messages.push({ role: 'assistant', content: j.content }); continue; }
        break;
      }
      if (!j) { fim({ ok: false, erro: 'A pesquisa na web demorou demais. Tente de novo.' }); return; }

      const fontes = [];
      (Array.isArray(j.content) ? j.content : []).forEach(function (b) {
        if (b && b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          b.content.forEach(function (rs) { if (rs && rs.url) fontes.push({ url: rs.url, title: rs.title || rs.url }); });
        }
      });
      const seen = {}; const fontesU = fontes.filter(function (f) { if (seen[f.url]) return false; seen[f.url] = 1; return true; }).slice(0, 12);
      const contexto = (Array.isArray(j.content) ? j.content.map(function (b) { return (b && typeof b.text === 'string') ? b.text : ''; }).join('\n') : '').trim();

      fim({ ok: true, contexto: contexto, fontes: fontesU });
    } catch (e) {
      fim({ ok: false, erro: 'Falha interna na pesquisa.', detalhe: String(e).slice(0, 300) });
    }
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (_) {} return; }
    res.status(500).json({ erro: 'Falha interna na pesquisa.', detalhe: String(e).slice(0, 300) });
  }
}