document.addEventListener("DOMContentLoaded", () => {
    // --- CONFIGURAÇÃO DA API ---
    const GEMINI_API_KEY = "AIzaSyCDBWKgPm4hW31GcCmnhOjnGQiI_PMB2eU"; // IMPORTANTE: Substitua pela sua chave
    // CORREÇÃO: Usando um modelo da sua lista de modelos disponíveis
    const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20"; 
  
    // --- INICIALIZAÇÃO DO MAPA ---
    const map = L.map("map", {
      crs: L.CRS.Simple,
      center: [0, 0],
      zoom: 2,
      minZoom: 0,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
    });
  
    const imageBounds = [
      [-500, -500],
      [500, 500],
    ];
    L.imageOverlay(
      "https://placehold.co/1000x1000/0D1117/404040?text=Carregue+uma+imagem+CTX",
      imageBounds
    ).addTo(map);
    map.fitBounds(imageBounds);
  
    // --- ELEMENTOS DA UI ---
    const latVal = document.getElementById("lat-val");
    const lonVal = document.getElementById("lon-val");
    const zoomVal = document.getElementById("zoom-val");
    const toolBtns = document.querySelectorAll(".tool-btn");
    const controlPanel = document.getElementById("control-panel");
    const panelTitle = document.getElementById("panel-title");
    const panelContent = document.getElementById("panel-content");
    const closePanelBtn = document.getElementById("close-panel-btn");
    const loaderOverlay = document.getElementById("loader-overlay");
    const loaderText = document.getElementById("loader-text");
  
    // --- VARIÁVEIS DE ESTADO ---
    let activePanel = null;
    let selectionRectangle = null;
    let isDrawing = false;
    let startPoint;
    let geminiResultsLayer = L.layerGroup().addTo(map);
    
    // CORREÇÃO: Variáveis declaradas aqui para serem acessíveis globalmente no script
    let currentImageURL = null;
    let currentImageDimensions = null;
    let currentOverlay = null;
    let lastGeminiAnalysis = { prompt: null, results: [] };
  
  
    // --- FUNÇÕES GERAIS ---
    const updateContextInfo = (e) => {
      const latlng = e.latlng || map.getCenter();
      latVal.textContent = latlng.lat.toFixed(2);
      lonVal.textContent = latlng.lng.toFixed(2);
      zoomVal.textContent = map.getZoom();
    };
    
    const showLoader = (text) => {
        loaderText.textContent = text;
        loaderOverlay.classList.remove("hidden");
    };
    const hideLoader = () => loaderOverlay.classList.add("hidden");
  
    // --- MODAIS ---
    const alertModal = document.getElementById("alert-modal");
    const alertMessage = document.getElementById("alert-message");
    const closeAlertBtn = document.getElementById("close-alert-btn");
    const showAppAlert = (message) => {
      alertMessage.textContent = message;
      alertModal.classList.remove("hidden");
    };
    closeAlertBtn.addEventListener("click", () => alertModal.classList.add("hidden"));
  
    const reportModal = document.getElementById("report-modal");
    const reportContent = document.getElementById("report-content");
    const closeReportBtn = document.getElementById("close-report-btn");
    const copyReportBtn = document.getElementById("copy-report-btn");
    closeReportBtn.addEventListener("click", () => reportModal.classList.add("hidden"));
    copyReportBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(reportContent.innerText);
      copyReportBtn.textContent = "Copiado!";
      setTimeout(() => { copyReportBtn.textContent = "Copiar Relatório"; }, 2000);
    });
  
  
    // --- LÓGICA DO PAINEL LATERAL ---
    const panelTemplates = {
      layers: {
        title: "Camadas de Dados",
        content: `
          <div class="flex flex-col gap-4 text-sm">
              <label class="flex flex-col gap-2">
                  <span>Carregar Imagem CTX (.IMG):</span>
                  <input type="file" id="ctx-file" accept=".IMG" class="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#00F6FF]/10 file:text-[#00F6FF] hover:file:bg-[#00F6FF]/20">
              </label>
              <p class="text-xs text-white/60">A análise Gemini usará esta imagem.</p>
              <div id="image-description-container" class="hidden">
                  <button id="get-description-btn" class="w-full mt-2 bg-teal-500 text-white font-bold py-2 rounded-md hover:bg-opacity-80 transition-all flex items-center justify-center gap-2">
                      Obter Descrição da Imagem ✨
                  </button>
                  <div id="description-output" class="mt-4 text-xs text-white/70 p-3 bg-[#0D1117] rounded-md border border-white/20"></div>
              </div>
          </div>`,
      },
      ai: {
        title: "Análise IA (Mock)",
        content: `
          <div class="flex flex-col gap-4">
              <p class="text-sm text-white/70">Clique e arraste no mapa para selecionar uma região (simulação).</p>
          </div>`,
      },
    };
  
    const openPanel = (panelName) => {
      const template = panelTemplates[panelName];
      if (!template) return;
      panelTitle.textContent = template.title;
      panelContent.innerHTML = template.content;
      controlPanel.classList.add("active");
      activePanel = panelName;
      if (panelName === "ai") map.getContainer().style.cursor = "crosshair";
      
      if (panelName === "layers") {
        if (currentImageURL) {
            document.getElementById("image-description-container").classList.remove("hidden");
            document.getElementById("get-description-btn").addEventListener("click", getImageDescription);
        }
      }
    };
  
    const closePanel = () => {
      controlPanel.classList.remove("active");
      toolBtns.forEach((b) => b.classList.remove("active"));
      map.getContainer().style.cursor = "";
      if (selectionRectangle) map.removeLayer(selectionRectangle);
      selectionRectangle = null;
      activePanel = null;
    };
  
    toolBtns.forEach((btn) => {
      if (btn.dataset.panel) {
        btn.addEventListener("click", () => {
          const panelName = btn.dataset.panel;
          activePanel === panelName ? closePanel() : (closePanel(), btn.classList.add("active"), openPanel(panelName));
        });
      }
    });
  
    closePanelBtn.addEventListener("click", closePanel);
  
    // --- LÓGICA GEMINI ---
    const geminiBtn = document.getElementById("btn-gemini");
    const geminiModal = document.getElementById("gemini-modal");
    const closeGeminiModalBtn = document.getElementById("close-gemini-modal-btn");
    const geminiSubmitBtn = document.getElementById("gemini-submit-btn");
    const geminiReportBtn = document.getElementById("gemini-report-btn");
    const geminiPrompt = document.getElementById("gemini-prompt");
  
    geminiBtn.addEventListener("click", () => {
      if (!currentImageURL) {
        showAppAlert("Por favor, carregue uma imagem CTX na aba 'Camadas' antes de usar a análise Gemini.");
        return;
      }
      closePanel();
      geminiModal.classList.remove("hidden");
    });
    closeGeminiModalBtn.addEventListener("click", () => geminiModal.classList.add("hidden"));
  
    async function makeGeminiRequest(parts) {
       if (GEMINI_API_KEY === "YOUR_API_KEY") {
        showAppAlert("Chave da API não configurada. Edite o arquivo js/script.js e insira sua chave da API do Gemini.");
        return null;
      }
      
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const requestBody = { "contents": [{ "parts": parts }] };
  
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Erro na API: ${error.error.message}`);
        }
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      } catch (error) {
        console.error("Erro ao chamar a API Gemini:", error);
        showAppAlert(`Falha na API Gemini: ${error.message}`);
        return null;
      }
    }
    
    async function getImageDescription() {
      showLoader("Analisando imagem...");
      const descriptionOutput = document.getElementById("description-output");
      descriptionOutput.innerHTML = 'Analisando...';
      
      const parts = [
        { "text": "Aja como um geólogo planetário. Descreva sucintamente a área nesta imagem em 2 a 3 frases, destacando as principais feições geológicas visíveis." },
        { "inline_data": { "mime_type": "image/png", "data": currentImageURL.split(',')[1] } }
      ];
  
      const result = await makeGeminiRequest(parts);
      hideLoader();
      if(result) {
          descriptionOutput.innerHTML = result;
      } else {
          descriptionOutput.innerHTML = 'Falha ao obter descrição.';
      }
    }
  
    geminiSubmitBtn.addEventListener("click", async () => {
      const prompt = geminiPrompt.value;
      if (!prompt || !currentImageURL || !currentImageDimensions) return;
      
      showLoader("Consultando Gemini...");
      geminiReportBtn.classList.add("hidden");
  
      const parts = [
        { "text": `Você é um especialista em geologia planetária. Analise a imagem. O usuário pediu: "${prompt}". A imagem tem ${currentImageDimensions.width}x${currentImageDimensions.height} pixels. O canto superior esquerdo é (0,0). Responda APENAS com um array JSON de objetos, com o formato: {"x": coord_pixel_x, "y": coord_pixel_y, "label": "descrição da feição"}. Não inclua texto adicional.` },
        { "inline_data": { "mime_type": "image/png", "data": currentImageURL.split(',')[1] } }
      ];
      
      const rawResult = await makeGeminiRequest(parts);
      hideLoader();
      if (!rawResult) return;
  
      try {
        const jsonText = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
        const results = JSON.parse(jsonText);
        
        geminiResultsLayer.clearLayers();
        results.forEach((res) => {
          L.circleMarker([res.y, res.x], { color: "#FFB800", radius: 10, fillColor: "#FFB800", fillOpacity: 0.5 })
            .addTo(geminiResultsLayer)
            .bindPopup(`<b>${res.label}</b><br>Identificado via Gemini.`)
            .openPopup();
        });
  
        lastGeminiAnalysis = { prompt, results };
        geminiReportBtn.classList.remove("hidden");
        geminiModal.classList.add("hidden");
  
      } catch (e) {
        console.error("Erro ao processar resposta do Gemini:", e);
        showAppAlert("O Gemini retornou uma resposta em formato inesperado. Tente refazer a pergunta.");
      }
    });
  
    geminiReportBtn.addEventListener("click", async () => {
      if (!lastGeminiAnalysis.prompt || lastGeminiAnalysis.results.length === 0) return;
  
      showLoader("Gerando relatório...");
      reportContent.innerHTML = '<p>Gerando relatório...</p>';
      reportModal.classList.remove("hidden");
      
      const findingsAsText = lastGeminiAnalysis.results.map(r => `- ${r.label}`).join("\n");
      
      const parts = [
        { "text": `Aja como um especialista em uma missão de exploração planetária. Escreva um relatório técnico conciso em Markdown. A solicitação inicial da análise foi: "${lastGeminiAnalysis.prompt}". A análise da IA encontrou os seguintes pontos de interesse:\n${findingsAsText}\n\nCom base nisso, escreva um resumo analítico, descreva as implicações e sugira próximos passos para a investigação.` }
      ];
  
      const report = await makeGeminiRequest(parts);
      hideLoader();
  
      if(report) {
        // Basic Markdown to HTML
        let htmlReport = report
          .replace(/## (.*)/g, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
          .replace(/### (.*)/g, '<h3 class="text-md font-bold mt-3 mb-1">$1</h3>')
          .replace(/\* (.*)/g, '<li class="ml-4">$1</li>')
          .replace(/\n/g, '<br>');
        reportContent.innerHTML = htmlReport;
      } else {
        reportContent.innerHTML = "<p>Falha ao gerar o relatório.</p>";
      }
    });
  
    // --- LÓGICA DE ANÁLISE IA (MOCK) ---
    map.on("mousedown", (e) => {
      if (activePanel !== "ai") return;
      isDrawing = true;
      startPoint = e.latlng;
      if (selectionRectangle) map.removeLayer(selectionRectangle);
      selectionRectangle = L.rectangle([startPoint, startPoint], {
        color: "#FFB800", weight: 2, fillOpacity: 0.1, dashArray: "5, 5",
      }).addTo(map);
    });
    map.on("mousemove", (e) => {
      if (!isDrawing) return;
      selectionRectangle.setBounds(L.latLngBounds(startPoint, e.latlng));
    });
    map.on("mouseup", () => {
      if (!isDrawing) return;
      isDrawing = false;
      showLoader("Analisando região...");
      setTimeout(() => {
        hideLoader();
        if (selectionRectangle) {
          selectionRectangle.setStyle({ className: "pulsing-border" });
          L.circleMarker(selectionRectangle.getBounds().getCenter(), { color: "#00F6FF", radius: 8 })
            .addTo(map).bindPopup("Cratera Identificada (Mock)").openPopup();
        }
        closePanel();
      }, 1500);
    });
  
    // --- PROCESSAMENTO DE ARQUIVO DE IMAGEM ---
    document.addEventListener("change", (e) => {
      if (e.target.id === "ctx-file") {
        const file = e.target.files[0];
        if (!file) return;
  
        const reader = new FileReader();
        reader.onload = function (evt) {
          const buffer = evt.target.result;
          const data = new Uint8Array(buffer);
  
          const width = 5056, height = 7168, headerBytes = 5056;
          const pixels = data.slice(headerBytes);
  
          function percentile(arr, p) {
            const sorted = [...arr].sort((a, b) => a - b);
            return sorted[Math.floor((p / 100) * sorted.length)];
          }
          const step = Math.floor(pixels.length / 50000);
          const sample = [];
          for (let i = 0; i < pixels.length; i += step) sample.push(pixels[i]);
          const p2 = percentile(sample, 2);
          const p98 = percentile(sample, 98);
  
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          const imgData = ctx.createImageData(width, height);
  
          for (let i = 0; i < pixels.length; i++) {
            let v = ((pixels[i] - p2) / (p98 - p2)) * 255;
            v = Math.max(0, Math.min(255, v));
            imgData.data[i * 4] = v;
            imgData.data[i * 4 + 1] = v;
            imgData.data[i * 4 + 2] = v;
            imgData.data[i * 4 + 3] = 255;
          }
          ctx.putImageData(imgData, 0, 0);
          
          // CORREÇÃO: Atribuição dos valores às variáveis globais
          currentImageURL = canvas.toDataURL("image/png");
          currentImageDimensions = { width, height };
  
          // Reseta o estado da análise anterior
          geminiReportBtn.classList.add("hidden");
          lastGeminiAnalysis = { prompt: null, results: [] };
          geminiResultsLayer.clearLayers();
  
          if (currentOverlay) map.removeLayer(currentOverlay);
  
          const newBounds = [[0, 0], [height, width]];
          currentOverlay = L.imageOverlay(currentImageURL, newBounds).addTo(map);
          map.fitBounds(newBounds);
  
          if (activePanel === 'layers') {
              openPanel('layers'); // Re-renderiza o painel para mostrar o novo botão
          }
        };
        reader.readAsArrayBuffer(file);
      }
    });
    
    // --- ATUALIZAÇÃO INICIAL E EVENT LISTENERS DO MAPA ---
    map.on("mousemove", updateContextInfo);
    map.on("zoomend", updateContextInfo);
    map.on("moveend", updateContextInfo);
    updateContextInfo({ latlng: map.getCenter() });
  });
  
  