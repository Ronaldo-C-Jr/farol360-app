// FAROL360 — Etapa 2: redige o relatório. Rota: POST /api/analisar
// NÃO pesquisa (isso é a etapa 1). Recebe { dados, modelo, contexto } e devolve o relatório em JSON.

const MODELOS = {
  haiku:  { id: 'claude-haiku-4-5',  max: 6500 },
  sonnet: { id: 'claude-sonnet-5',   max: 9000 },
  opus:   { id: 'claude-opus-4-8',   max: 11000 },
};

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
2. Use os DADOS PESQUISADOS fornecidos como base factual; quando um número vier deles, é observado (est:false) e a evidência é a fonte real.
3. Nunca apresente proxy ou índice de imagem como intenção de voto nem como fato oficial.
4. Lacuna de dado é declarada — nunca preenchida com suposição decorativa.
5. Fonte enviada pelo cliente NÃO é oficial automaticamente: classifique-a.
6. Não invente fontes, números ou citações.
7. Tom consultivo: responda ao "e daí?", com implicações práticas.
8. Responda EXCLUSIVAMENTE com um objeto JSON válido no formato pedido. Sem texto fora do JSON. Seja conciso: frases curtas, no máximo 4 itens por lista.`;

function promptEmpresa(d, contexto) {
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

DADOS PESQUISADOS NA WEB (use como base factual; classifique a evidência conforme a fonte):
${contexto ? contexto : '(nenhuma pesquisa disponível — trabalhe com conhecimento do setor e marque tudo como estimativa)'}

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

function promptGoverno(d, contexto) {
  return `Gere uma AVALIAÇÃO INDIVIDUAL DE GOVERNO — ampla, didática e consultiva (não gire em torno de um único indicador).

DADOS:
- Município/UF: ${d.municipio || '(não informado)'}
- Instância: ${d.instancia || '(não informado)'}
- Área temática: ${d.area || 'Geral'}
- Período histórico: ${d.periodo || 'últimos anos'}
- Período de projeção: ${d.projecao || 'sem projeção'}
- Fontes próprias do cliente: ${d.fontes ? d.fontes : 'nenhuma'} (classificar; não tratar como oficiais)

DADOS PESQUISADOS NA WEB (use como base factual; classifique a evidência conforme a fonte):
${contexto ? contexto : '(nenhuma pesquisa disponível — trabalhe com conhecimento do setor público e marque tudo como estimativa)'}

EXIGÊNCIAS DE AMPLITUDE (obrigatórias):
- indicadores: NO MÍNIMO 6 indicadores DISTINTOS e relevantes da área (não só um). Cada um com valor do município, do estado e do Brasil (benchmarking), unidade e tendência.
- temporal: evolução ano a ano no período informado.
- escalas_ods: pelo menos 4 dimensões pontuadas de 0 a 10.
- sentimento: percepção por período (nota 0–100).
- hipoteses: 3+ hipóteses analíticas, cada uma com uma proposta de intervenção prática.
- resumo_executivo: 5 a 8 bullets consultivos.

REGRAS:
- NUNCA valores monetários. Só %, índices, per capita ou notas.
- Cada dado leva "evidencia": oficial | derivado-estadual | analogia-pares | tendencial | proxy.
- "est":true quando o número for estimativa.
- Sentimento é proxy, nunca intenção de voto. Declarar lacunas; não inventar fontes nem números.`;
}

const SCHEMA_GOVERNO = `FORMATO JSON OBRIGATÓRIO (preencha TODOS os campos; respeite as quantidades mínimas; "est":true onde o valor for estimativa):
{
 "cabecalho":{"municipio":"","instancia":"","area":"","periodo_hist":"","periodo_proj":"","eixos_ods":"","confiabilidade_0_100":0,"integridade_0_100":0},
 "resumo_executivo":["","","","",""],
 "indicadores":[{"indicador":"","unidade":"","municipio":"","estado":"","brasil":"","tendencia":"","evidencia":"oficial","est":false}],
 "benchmarking":[{"referencia":"","municipio":"","media":"","diferenca":""}],
 "temporal":[{"ano":"","fato":"","indicador_ref":""}],
 "escalas_ods":[{"dimensao":"","meta_ods":"","escore_0_10":0}],
 "sentimento":[{"periodo":"","polaridade_0_100":0,"leitura":""}],
 "hipoteses":[{"hipotese":"","proposta":""}],
 "diagnostico":"",
 "barreiras":["",""],
 "projecoes":[{"ano":"","indicador":"","sem_intervencao":"","com_intervencao":"","est":true}],
 "swot":{"forcas":[],"fraquezas":[],"oportunidades":[],"ameacas":[]},
 "gut":[{"problema":"","g":0,"u":0,"t":0,"gut":0,"prioridade":""}],
 "pdca":[{"etapa":"","objetivo":"","indicador":"","prazo":""}],
 "conclusao":"",
 "confiabilidade":{"nota_0_100":0,"limitacoes":[]}
}`;

function extrairJSON(txt) {
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
    const { promptId = 'empresa', dados = {}, modelo = 'sonnet', contexto = '' } = body;
    if (promptId !== 'empresa' && promptId !== 'governo') { res.status(400).json({ erro: 'Análise não reconhecida.' }); return; }

    const m = MODELOS[modelo] || MODELOS.sonnet;
    const base = promptId === 'governo'
      ? promptGoverno(dados, contexto) + '\n\n' + SCHEMA_GOVERNO
      : promptEmpresa(dados, contexto) + '\n\n' + SCHEMA_EMPRESA;
    const userPrompt = base + '\n\nResponda APENAS com o objeto JSON, começando com { e terminando com }. Sem texto antes ou depois, sem cercas de código.';

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 240000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m.id, max_tokens: m.max, system: SYSTEM, messages: [{ role: 'user', content: userPrompt }] }),
      });
    } catch (e) { clearTimeout(to); res.status(504).json({ erro: 'A redação do relatório demorou demais. Tente de novo, ou use o modelo Haiku.' }); return; }
    clearTimeout(to);

    if (!r.ok) {
      const t = await r.text();
      console.error('Anthropic HTTP', r.status, t);
      res.status(502).json({ erro: 'A IA recusou a chamada (HTTP ' + r.status + '): ' + t.slice(0, 400), detalhe: t.slice(0, 400) });
      return;
    }
    const j = await r.json();
    const texto = (Array.isArray(j.content) ? j.content.map(function (b) { return (b && typeof b.text === 'string') ? b.text : ''; }).join('') : '').trim();
    if (!texto) {
      res.status(502).json({ erro: 'A IA retornou conteúdo vazio (stop_reason=' + (j.stop_reason || '?') + ').' });
      return;
    }
    let relatorio;
    try { relatorio = JSON.parse(extrairJSON(texto)); }
    catch (e) {
      res.status(502).json({ erro: 'A IA não devolveu JSON válido (stop_reason=' + (j.stop_reason || '?') + '). Início: ' + texto.slice(0, 160) + ' […] Fim: ' + texto.slice(-160) });
      return;
    }
    res.status(200).json({ ok: true, relatorio, uso: j.usage || null, modelo: m.id });
  } catch (e) {
    res.status(500).json({ erro: 'Falha interna do servidor.', detalhe: String(e).slice(0, 300) });
  }
}