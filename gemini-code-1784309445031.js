const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');

// CONFIGURAÇÕES - Cole aqui os seus IDs do Google
const GEMINI_KEY = "AQ.Ab8RN6Klcy7SMOFWpz8nS9tz8sKjrIPhEuSrFbAZFh7QUx6lew"; 
const ID_PLANILHA = "1Dlw54YOcYDhd_32qyVdjCWFvHRrnCbTTyK5e9Re9SVs"; 
const ID_DOCS = "1O-669rGMid1xbe7wTpxZkQBgrMs2TRzjGbJUJNJA6Fc";

const ai = new GoogleGenAI({ apiKey: AQ.Ab8RN6Klcy7SMOFWpz8nS9tz8sKjrIPhEuSrFbAZFh7QUx6lew });

async function conectarWhatsapp() {
    // Render guarda as credenciais na pasta /data para não deslogar
    const { state, saveCreds } = await useMultiFileAuthState('/data/session');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Desativamos no terminal bruto, o Render lerá nos Logs
    });

    // Quando precisar conectar, ele vai desenhar o QR Code no painel de Logs do Render
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if(qr) {
            console.log("=== ESCANEIE ESTE QR CODE NO SEU WHATSAPP ===");
            qrcode.generate(qr, { small: true });
        }
        if(connection === 'close') conectarWhatsapp(); // Reconecta se cair
    });

    sock.ev.on('creds.update', saveCreds);

    // Quando chega mensagem nova
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const textoCliente = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const numeroCliente = msg.key.remoteJid;

            if (!textoCliente) return;

            try {
                // Busca regras e estoque (Links dinâmicos em formato CSV/Texto)
                const resSheets = await fetch(`https://docs.google.com/spreadsheets/d/${ID_PLANILHA}/gviz/tq?tqx=out:csv`);
                const dadosEstoque = await resSheets.text();
                
                const resDocs = await fetch(`https://docs.google.com/document/d/${ID_DOCS}/export?format=txt`);
                const regrasNegocio = await resDocs.text();

                // Alimenta o Gemini Flash (Plano Gratuito)
                const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
                const promptCompleto = `${regrasNegocio}\n\nEstoque Atual:\n${dadosEstoque}\n\nCliente: ${textoCliente}`;
                
                const resultado = await model.generateContent(promptCompleto);
                const respostaIA = resultado.response.text();

                // Envia a resposta de volta pro cliente
                await sock.sendMessage(numeroCliente, { text: respostaIA });

            } catch (err) {
                console.error("Erro ao processar:", err);
            }
        }
    });
}

conectarWhatsapp();
