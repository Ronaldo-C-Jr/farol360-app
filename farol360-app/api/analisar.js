// FAROL360 — Função de servidor (Vercel). Rota: POST /api/analisar
// Guarda a chave de API com segurança (variável de ambiente) e conversa com o Claude.
// Recebe { promptId, dados, modelo } e devolve o relatório em JSON.

const MODELOS = {
  haiku:  { id: 'claude-haiku-4-5',  max: 4500 },
  sonnet: { id: 'claude-sonnet-5',   max: 5500 },
  opus:   { id: 'claude-opus-4-8',   max: 6000 },
};

// Camada de sistema — metodologia FAROL360 (igual em toda análise)
const SYSTEM = `Você é o motor analítico do FAROL360, sistema de inteligência estratégica.
Produza análise rigorosa, consultiva e auditável, seguindo regras inegociáveis.

CLASSIFICAÇÃO DA EVIDÊNCIA — todo dado carrega sua natureza:
- OFICIAL: fonte oficial verificável.
- DERIVADO: calculado a partir de base oficial.
- ANALOGIA: inferido de casos/pares comparáveis.
- PROXY: sinal indireto (digital, notícia) — nunca medida direta.
- ESTIMATIVA/INFERÊNCIA: conclusão não observada.

REGRAS:
1. Todo número não observado é estimativa: marque o campo "est": true.
2. Nunca apresente proxy ou índice de imagem como intenção de voto nem como fato oficial.
3. Lacuna de dado é declarada — nunca preenchida com suposição decorativa.
4. Fonte enviada pelo cliente NÃO é oficial automaticamente: classifique-a.
5. Não invente fontes, números ou citações.
6. Tom consultivo: responda ao "e daí?", com implicações práticas.
7. Responda EXCLUSIVAMENTE com um objeto JSON válido no formato pedido. Sem texto fora do JSON.`;

function promptEmpresa(d) {
  const topicos = Array.isArray(d.topicos) ? d.topicos.join(', ') : (d.topicos || 'nenhum');
  return `Gere uma ANÁLISE ESTRATÉGICA DE EMPRESA.

DADOS:
- Empresa: ${d.empresa || '(não informado)'}
- Setor: ${d.setor || '(não informado)'}
- Cidade/sede: ${d.cidade || '(não informado)'}
- Período: ${d.periodo || 'últimos 3 anos'}
- Modo: ${d.modo || 'Completo'}
- Tópicos adicionais: ${topicos}
- Fontes próprias do cliente: ${d.fontes ? d.fontes : 'nenhuma'} (classificar; não tratar como oficiais)

REGRAS ESPECÍFICAS:
- NUNCA usar valores monetários. Só percentuais, índices ou números relativos.
- KPIs sempre em faixa (P5–P95).
- Explicar cada sigla no primeiro uso.
- Todo indicador gera recomendação prática.
- Incluir sempre o One Pager executivo.`;
}

const SCHEMA_EMPRESA = `FORMATO JSON OBRIGATÓRIO (preencha todos os campos; "est":true onde o valor for estimativa):
{
 "cabecalho":{"empresa":"","setor":"","cidade":"","periodo":"","modo":"","confiabilidade_0_100":0},
 "one_pager":{"indice_competitividade":{"valor":0,"est":true},
   "kpis_topo":[{"nome":"","faixa":"","est":true}],
   "cenario_base_12m":{"texto":"","est":true},"conclusao_consultiva":""},
 "pestel":[{"fator":"","leitura":"","implicacao":"","evidencia":"proxy"}],
 "competitivo":{"porter":"","vrio":"",
   "swot":{"forcas":[],"fraquezas":[],"oportunidades":[],"ameacas":[]}},
 "kpis":[{"nome":"","faixa_p5_p95":"","interpretacao":"","recomendacao":"","est":true}],
 "clientes_segmentos":[{"segmento":"","participacao":"","leitura":"","est":true}],
 "projecoes_12m":[{"cenario":"","receita_relativa":"","margem":"","leitura":"","est":true}],
 "roadmap":[{"horizonte":"","acao":""}],
 "confiabilidade":{"nota_0_100":0,"limitacoes":[],"fontes_cliente_consideradas":false}
}`;

function extrairJSON(txt) {
  // Remove cercas de código se houver e isola o objeto
  let s = String(txt).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/,'').trim();
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  return (i >= 0 && j > i) ? s.slice(i, j + 1) : s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Use POST.' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { promptId = 'empresa', dados = {}, modelo = 'sonnet' } = body;
    if (promptId !== 'empresa') { res.status(400).json({ erro: 'Nesta etapa só a análise de Empresa está ligada à IA.' }); return; }

    const m = MODELOS[modelo] || MODELOS.sonnet;
    const userPrompt = promptEmpresa(dados) + '\n\n' + SCHEMA_EMPRESA;
    const deadline = Date.now() + 55000;
    const messages = [{ role: 'user', content: userPrompt + '\n\nPESQUISE dados reais e atuais na web antes de concluir: dados do IBGE e setoriais, concorrentes nomeados, e a presença pública da própria empresa. Use o que encontrar (marque como oficial/analogia/proxy conforme a fonte). Ao final, responda APENAS com o objeto JSON pedido, começando com { e terminando com }.' }];

    let j = null;
    for (let iter = 0; iter < 3; iter++) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) break;
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), remaining);
      let r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ac.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: m.id,
            max_tokens: m.max,
            system: SYSTEM,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
            messages: messages,
          }),
        });
      } catch (e) {
        clearTimeout(to);
        res.status(504).json({ erro: 'A IA demorou demais (a pesquisa na web pode ter travado). Tente de novo, ou use o modelo Haiku.' });
        return;
      }
      clearTimeout(to);
      if (!r.ok) {
        const t = await r.text();
        console.error('Anthropic HTTP', r.status, t);
        res.status(502).json({ erro: 'A IA recusou a chamada (HTTP ' + r.status + '): ' + t.slice(0, 400), detalhe: t.slice(0, 400) });
        return;
      }
      j = await r.json();
      if (j.stop_reason === 'pause_turn' && Array.isArray(j.content)) {
        messages.push({ role: 'assistant', content: j.content });
        continue;
      }
      break;
    }
    if (!j) { res.status(504).json({ erro: 'A IA demorou demais para pesquisar. Tente de novo, ou use o modelo Haiku.' }); return; }

    const fontes = [];
    (Array.isArray(j.content) ? j.content : []).forEach(function (b) {
      if (b && b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach(function (rs) { if (rs && rs.url) fontes.push({ url: rs.url, title: rs.title || rs.url }); });
      }
    });
    const seen = {}; const fontesU = fontes.filter(function (f) { if (seen[f.url]) return false; seen[f.url] = 1; return true; }).slice(0, 12);

    const texto = (Array.isArray(j.content) ? j.content.map(function (b) { return (b && typeof b.text === 'string') ? b.text : ''; }).join('') : '').trim();
    if (!texto) {
      res.status(502).json({ erro: 'A IA retornou conteúdo vazio (stop_reason=' + (j.stop_reason || '?') + '). Estrutura: ' + JSON.stringify(j.content).slice(0, 500) });
      return;
    }
    let relatorio;
    try { relatorio = JSON.parse(extrairJSON(texto)); }
    catch (e) {
      res.status(502).json({ erro: 'A IA não devolveu JSON válido (stop_reason=' + (j.stop_reason || '?') + '). Início: ' + texto.slice(0, 160) + ' […] Fim: ' + texto.slice(-160), bruto: texto.slice(0, 1200) });
      return;
    }

    res.status(200).json({ ok: true, relatorio, fontes: fontesU, uso: j.usage || null, modelo: m.id });
  } catch (e) {
    res.status(500).json({ erro: 'Falha interna do servidor.', detalhe: String(e).slice(0, 300) });
  }
}