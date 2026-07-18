const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const qrcode = require('qrcode-terminal');

// CONFIGURAÇÕES - Cole aqui os seus IDs do Google
const GEMINI_KEY = process.env.GEMINI_API_KEY; 
const ID_PLANILHA = "1Dlw54YOcYDhd_32qyVdjCWFvHRrnCbTTyK5e9Re9SVs"; 
const ID_DOCS = "1O-669rGMid1xbe7wTpxZkQBgrMs2TRzjGbJUJNJA6Fc";

// Inicializa o cliente oficial atualizado da Google AI
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

async function conectarWhatsapp() {
    // Como estamos sem volume no plano free, salvamos na pasta local temporária
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if(qr) {
            console.log("=== ESCANEIE ESTE QR CODE NO SEU WHATSAPP ===");
            qrcode.generate(qr, { small: true });
        }
        if(connection === 'close') {
            console.log("Conexão fechada. Tentando reconectar...");
            conectarWhatsapp();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const textoCliente = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const numeroCliente = msg.key.remoteJid;

            if (!textoCliente) return;

            try {
                // Busca as planilhas e documentos
                const resSheets = await fetch(`https://docs.google.com/spreadsheets/d/${ID_PLANILHA}/gviz/tq?tqx=out:csv`);
                const dadosEstoque = await resSheets.text();
                
                const resDocs = await fetch(`https://docs.google.com/document/d/${ID_DOCS}/export?format=txt`);
                const regrasNegocio = await resDocs.text();

                // Comando atualizado para gerar conteúdo com o Gemini 1.5 Flash
                const promptCompleto = `${regrasNegocio}\n\nEstoque Atual:\n${dadosEstoque}\n\nCliente: ${textoCliente}`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: promptCompleto,
                });

                const respostaIA = response.text;

                await sock.sendMessage(numeroCliente, { text: respostaIA });

            } catch (err) {
                console.error("Erro ao processar mensagem:", err);
            }
        }
    });
}

conectarWhatsapp();
