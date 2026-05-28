import fs from 'fs';

function run() {
    const routerPath = 'n8n/roteador_contexto_v13_deterministic.js';
    const configPath = 'sofia_full_config.json';
    
    // 1. Lê o código do roteador para extrair a string do prompt de sistema
    const routerContent = fs.readFileSync(routerPath, 'utf8');
    
    // O prompt de sistema começa em finalPrompt = `<identity> e termina em </CONTEXTO_ATUAL>`;
    const promptStartKey = 'finalPrompt = `<identity>';
    const promptEndKey = '</CONTEXTO_ATUAL>`;';
    
    const startIndex = routerContent.indexOf(promptStartKey);
    const endIndex = routerContent.indexOf(promptEndKey);
    
    if (startIndex === -1 || endIndex === -1) {
        console.error("❌ Não foi possível encontrar a marcação do prompt de sistema no roteador!");
        return;
    }
    
    // Extrai o prompt puro (removendo "finalPrompt = `" do início e "`" do fim)
    const promptContent = routerContent.substring(
        startIndex + 'finalPrompt = `'.length,
        endIndex + '</CONTEXTO_ATUAL>'.length
    );
    
    console.log("✅ Prompt de sistema extraído com sucesso!");
    console.log("Tamanho do prompt extraído:", promptContent.length, "caracteres.");
    
    // 2. Lê a configuração atual
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 3. Atualiza o systemPrompt no brain_config do agente
    config.brain_config.systemPrompt = promptContent;
    
    // 4. Salva a configuração de volta no arquivo
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log("✅ Arquivo sofia_full_config.json atualizado com o novo Prompt de Sistema!");
}

run();
