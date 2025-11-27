// =======================
// Hadassa Rio Bot - Render
// =======================

const fs = require('fs');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const {
    Client,
    LocalAuth,
    MessageMedia
} = require('whatsapp-web.js');

// =======================
//  VARIÁVEIS DE AMBIENTE
// =======================

// Essas variáveis você configura na Render (Environment)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_NUMBER = process.env.OWNER_NUMBER;        // ex: 5521966758401@c.us
const PACOTES_API_URL = process.env.PACOTES_API_URL || ''; // opcional por enquanto

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️ SUPABASE_URL ou SUPABASE_KEY não configurados. Leads não serão salvos no banco.');
}

if (!OWNER_NUMBER) {
    console.warn('⚠️ OWNER_NUMBER não configurado. Notificações não serão enviadas.');
}

// Cliente Supabase
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// =======================
//  SESSÕES / LEADS
// =======================

const sessions = {}; // { [numero]: { stage: string, name: string } }
let leads = [];
let lastId = 0;

function getSession(id) {
    if (!sessions[id]) sessions[id] = { stage: 'idle', name: '' };
    return sessions[id];
}

function setStage(id, stage) {
    const s = getSession(id);
    s.stage = stage;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

// =======================
//  SUPABASE + NOTIFICAÇÃO
// =======================

async function saveLeadToSupabase(lead) {
    if (!supabase) {
        console.log('ℹ️ Supabase não configurado, não salvando no banco.');
        return;
    }
    try {
        const { error } = await supabase
            .from('leads')
            .insert({
                whatsapp: lead.whatsapp,
                nome: lead.nome,
                tipo: lead.tipo,
                mensagem: lead.mensagem,
                origem: lead.origem,
                status: lead.status,
                canal: lead.canal,
                dataCadastro: lead.dataCadastro
            });

        if (error) {
            console.error('❌ Erro ao salvar lead no Supabase:', error.message);
        } else {
            console.log('✅ Lead salvo no Supabase com sucesso');
        }
    } catch (e) {
        console.error('❌ Erro inesperado ao salvar lead no Supabase:', e.message);
    }
}

async function notifyOwner(lead) {
    if (!OWNER_NUMBER) {
        console.log('ℹ️ OWNER_NUMBER não configurado, não enviando notificação.');
        return;
    }
    try {
        const texto =
            '🔔 *NOVO ATENDIMENTO HADASSA RIO*\n\n' +
            `📱 WhatsApp: ${lead.whatsapp}\n` +
            (lead.nome ? `🙋 Nome: ${lead.nome}\n` : '') +
            `🧾 Tipo: ${lead.tipo}\n` +
            `💬 Mensagem: ${lead.mensagem}\n` +
            `📅 Data: ${lead.dataCadastro}\n`;

        await client.sendMessage(OWNER_NUMBER, texto);
        console.log('✅ Notificação enviada para o proprietário');
    } catch (e) {
        console.error('❌ Erro ao enviar notificação para o proprietário:', e.message);
    }
}

async function saveLead({ from, name, type, mensagem }) {
    lastId += 1;

    const lead = {
        id: lastId,
        whatsapp: from,
        nome: name || '',
        tipo: type,                          // orcamento | promocao | duvida | atendimento
        mensagem: mensagem || '',
        origem: 'Hadassa Viagens – Unidade Rio',
        status: 'novo',
        canal: 'whatsapp',
        dataCadastro: new Date().toISOString()
    };

    leads.push(lead);

    try {
        fs.writeFileSync('./leads.json', JSON.stringify(leads, null, 2));
        console.log('✅ Lead salvo em leads.json:', lead);
    } catch (e) {
        console.log('❌ Erro ao salvar leads.json:', e.message);
    }

    await saveLeadToSupabase(lead);
    await notifyOwner(lead);
}

// =======================
//  BUSCA DE PACOTES (OPCIONAL)
// =======================

async function buscarPacotesPorDestino(destinoTexto) {
    if (!PACOTES_API_URL) {
        console.log('ℹ️ PACOTES_API_URL não configurada, pulando busca automática.');
        return [];
    }

    try {
        const url = `${PACOTES_API_URL}?destino=${encodeURIComponent(destinoTexto)}`;
        console.log('🔎 Consultando API de pacotes:', url);
        const { data } = await axios.get(url);
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('❌ Erro ao buscar pacotes:', err.message);
        return [];
    }
}

// =======================
//  WHATSAPP CLIENT
// =======================

// Aqui está o dataPath CORRIGIDO para funcionar na Render
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'hadassa-rio-02',
        dataPath: './hadassa_auth2'   // pasta local no projeto
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    },
    webVersionCache: {
        type: 'none'
    }
});

// =======================
//  EVENTOS BÁSICOS
// =======================

client.on('qr', qr => {
    // Em servidor online, usamos um link para visualizar o QR
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
        encodeURIComponent(qr);
    console.log('📌 Abra este link no navegador do seu computador e escaneie o QR com o WhatsApp:');
    console.log(qrUrl);
});

client.on('ready', () => {
    console.log('✅ Tudo certo! WhatsApp conectado.');
});

client.on('auth_failure', msg => {
    console.error('❌ Falha de autenticação:', msg);
});

client.on('disconnected', reason => {
    console.log('🔌 Cliente desconectado:', reason);
});

// Inicializa o cliente
client.initialize().catch(err => {
    console.error('❌ Erro ao inicializar o cliente:', err);
});

// =======================
//  FUNÇÕES DE MENSAGEM
// =======================

async function sendMainMenu(msg, contactName) {
    const firstName = contactName ? contactName.split(' ')[0] : '';

    const texto =
        `Olá, ${firstName}!\n` +
        `Seja muito bem-vindo(a) à Hadassa Viagens – Unidade Rio ✈️\n\n` +
        `Eu sou o Leandro, consultor responsável pela unidade.\n\n` +
        `Como posso te ajudar hoje?\n\n` +
        `*1* - Quero um orçamento\n` +
        `*2* - Ver destinos\n` +
        `*3* - Promoções disponíveis\n` +
        `*4* - Falar com um atendente\n` +
        `*5* - Dúvidas gerais\n\n` +
        `_Responda com o número da opção._`;

    const chat = await msg.getChat();
    await delay(800);
    await chat.sendStateTyping();
    await delay(1200);

    await msg.reply(texto);
    setStage(msg.from, 'menu_principal');
}

async function sendDestinationImage(msg) {
    try {
        const media = await MessageMedia.fromFilePath('./imagens/maceio.jpg');
        await client.sendMessage(msg.from, media, { caption: 'Olha esse visual de Maceió 😍🌴' });
    } catch (e) {
        console.log('⚠️ Não consegui enviar a imagem. Verifique o caminho ./imagens/maceio.jpg (opcional).');
    }
}

// =======================
//  EVENTO PRINCIPAL DE MENSAGENS
// =======================

client.on('message', async msg => {
    console.log('📩 RAW => from:', msg.from, '| body:', JSON.stringify(msg.body));

    const textRaw = msg.body || '';
    const text = textRaw.trim().toLowerCase();
    const session = getSession(msg.from);

    console.log('➡️ Stage atual:', session.stage);

    if (msg.from === 'status@broadcast') return;

    if (text === 'ping') {
        await msg.reply('pong');
        return;
    }

    if (msg.from.endsWith('@g.us')) {
        await msg.reply('Sou o bot da Hadassa Viagens 🙂 Me chama no privado para atendimento completo.');
        return;
    }

    if (!msg.from.endsWith('@c.us') && !msg.from.endsWith('@lid')) {
        console.log('ℹ️ Remetente não suportado:', msg.from);
        return;
    }

    if (session.stage === 'idle') {
        const contact = await msg.getContact();
        session.name = contact.pushname || '';
        await sendMainMenu(msg, session.name);
        return;
    }

    if (text === 'menu' || text === '0' || text === 'oi') {
        await sendMainMenu(msg, session.name || '');
        return;
    }

    // MENU PRINCIPAL
    if (session.stage === 'menu_principal') {
        const isOption1 = text.startsWith('1');
        const isOption2 = text.startsWith('2');
        const isOption3 = text.startsWith('3');
        const isOption4 = text.startsWith('4');
        const isOption5 = text.startsWith('5');

        if (isOption1) {
            setStage(msg.from, 'orcamento_aguardando_dados');

            const chat = await msg.getChat();
            await chat.sendStateTyping();
            await delay(1200);

            await msg.reply(
                'Perfeito! Vamos preparar seu orçamento ✈️\n\n' +
                'Por favor, me envie em uma única mensagem:\n' +
                '- Destino desejado\n' +
                '- Data aproximada da viagem\n' +
                '- Número de adultos e crianças\n' +
                '- Se deseja incluir aéreo (sim/não)\n\n' +
                'Exemplo:\n' +
                'Gramado, maio de 2025, 2 adultos e 1 criança, sem aéreo.'
            );
            return;
        }

        if (isOption2) {
            setStage(msg.from, 'destinos_menu');

            const chat = await msg.getChat();
            await chat.sendStateTyping();
            await delay(1200);

            const destinosTexto =
                '*Alguns destinos que trabalhamos:*\n\n' +
                '*Brasil 🇧🇷*\n' +
                '- Jericoacoara, Porto de Galinhas, Gramado, Foz do Iguaçu\n' +
                '- Maragogi, Natal, Fortaleza, Bonito\n\n' +
                '*América do Sul 🌎*\n' +
                '- Buenos Aires, Bariloche, Ushuaia, Santiago\n\n' +
                '*Internacional 🌍*\n' +
                '- Israel, Egito, Europa, Dubai, Cancún\n\n' +
                'Me diga qual desses destinos você tem mais interesse 🙂';

            await msg.reply(destinosTexto);
            await sendDestinationImage(msg);
            return;
        }

        if (isOption3) {
            setStage(msg.from, 'promocoes_aguardando_destino');

            const chat = await msg.getChat();
            await chat.sendStateTyping();
            await delay(1200);

            await msg.reply(
                'Temos várias promoções rolando hoje ✈️🔥\n\n' +
                'Me diga qual destino você pensa em viajar (ex: Nordeste, Gramado, Buenos Aires, Cancún)\n' +
                'que eu vejo a melhor oferta pra você.'
            );
            return;
        }

        if (isOption4) {
            setStage(msg.from, 'atendente');

            const chat = await msg.getChat();
            await chat.sendStateTyping();
            await delay(1200);

            await msg.reply(
                'Certo! Já estou te atendendo aqui mesmo 👨‍💼\n\n' +
                'Pode me contar com calma o que você precisa que eu vou te ajudar.'
            );
            return;
        }

        if (isOption5) {
            setStage(msg.from, 'duvidas');

            const chat = await msg.getChat();
            await chat.sendStateTyping();
            await delay(1200);

            await msg.reply(
                'Claro! Posso te ajudar com dúvidas sobre:\n' +
                '- Documentos para viagem\n' +
                '- Bagagem\n' +
                '- Formas de pagamento e parcelamento\n' +
                '- Aéreo e conexões\n' +
                '- Taxas e regras das cias\n\n' +
                'Me conta qual é a sua dúvida 🙂'
            );
            return;
        }

        await msg.reply(
            'Não entendi a opção 😅\n\n' +
            'Envie *1, 2, 3, 4 ou 5* ou digite *menu* para ver as opções novamente.'
        );
        return;
    }

    // ORÇAMENTO
    if (session.stage === 'orcamento_aguardando_dados') {
        await saveLead({
            from: msg.from,
            name: session.name,
            type: 'orcamento',
            mensagem: msg.body
        });

        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await delay(800);

        const destinoBruto = msg.body.split(',')[0] || msg.body;
        const destino = destinoBruto.trim();

        await msg.reply(
            `Perfeito, já anotei todas as informações para *${destino}* ✍️\n` +
            'Vou buscar as melhores opções na nossa base e te retorno com os valores.\n\n' +
            'Se quiser ver outras possibilidades enquanto isso, pode digitar *menu*.'
        );

        const pacotes = await buscarPacotesPorDestino(destino);
        if (pacotes && pacotes.length) {
            let texto = `Encontrei algumas opções automáticas para *${destino}* ✈️\n\n`;
            const maxOpcoes = Math.min(3, pacotes.length);
            for (let i = 0; i < maxOpcoes; i++) {
                const p = pacotes[i];
                const codigo = p['CÓDIGO'] || p['CODIGO'] || p['Código'] || p['Codigo'] || '';
                const destNome = p['DESTINO'] || p['Destino'] || destino;
                const valor =
                    p['VALOR'] ||
                    p['VALOR PARCELADO'] ||
                    p['VALOR Á VISTA'] ||
                    p['VALOR A VISTA'] ||
                    p['VALOR DO PACOTE'] ||
                    '';

                texto += `*Opção ${i + 1}*\n`;
                if (codigo) texto += `Código: ${codigo}\n`;
                texto += `Destino: ${destNome}\n`;
                if (valor) texto += `Valor de referência: ${valor}\n\n`;
            }
            texto += 'Esses são valores de tabela. Se quiser, ajusto para seu orçamento 😊';
            await msg.reply(texto);
        }

        setStage(msg.from, 'idle');
        return;
    }

    // PROMOÇÕES
    if (session.stage === 'promocoes_aguardando_destino') {
        await saveLead({
            from: msg.from,
            name: session.name,
            type: 'promocao',
            mensagem: msg.body
        });

        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await delay(1200);

        await msg.reply(
            'Show! Vou buscar as melhores promoções para: ' + msg.body + ' ✈️\n' +
            'Assim que eu tiver alguma condição especial, eu te aviso aqui.\n\n' +
            'Se quiser, pode digitar *menu* para ver outras opções.'
        );
        setStage(msg.from, 'idle');
        return;
    }

    // DÚVIDAS
    if (session.stage === 'duvidas') {
        await saveLead({
            from: msg.from,
            name: session.name,
            type: 'duvida',
            mensagem: msg.body
        });

        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await delay(1200);

        await msg.reply(
            'Boa pergunta! Vou te responder direitinho em seguida 😉\n\n' +
            'Enquanto isso, se quiser ver os serviços, digite *menu*.'
        );
        setStage(msg.from, 'idle');
        return;
    }

    // ATENDENTE
    if (session.stage === 'atendente') {
        await saveLead({
            from: msg.from,
            name: session.name,
            type: 'atendimento',
            mensagem: msg.body
        });

        await msg.reply(
            'Entendi 👍\nMe conta mais detalhes ou, se preferir, digite *menu* para voltar ao início.'
        );
        return;
    }

    // FALLBACK
    await msg.reply(
        'Olá! Digite *menu* ou *oi* para ver as opções de atendimento da Hadassa Viagens – Unidade Rio ✈️'
    );
});
