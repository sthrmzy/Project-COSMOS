document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map', {
        crs: L.CRS.Simple,
        center: [0, 0],
        zoom: 2,
        minZoom: 0,
        maxZoom: 10,
        zoomControl: false,
        attributionControl: false,
    });
    
    const imageBounds = [[-500, -500], [500, 500]];
    L.imageOverlay('https://placehold.co/1000x1000/0D1117/161B22?text=NASA+IMAGE+AREA', imageBounds).addTo(map);
    map.fitBounds(imageBounds);


    const latVal = document.getElementById('lat-val');
    const lonVal = document.getElementById('lon-val');
    const zoomVal = document.getElementById('zoom-val');

    const updateContextInfo = (e) => {
        const latlng = e.latlng || map.getCenter();
        latVal.textContent = latlng.lat.toFixed(2);
        lonVal.textContent = latlng.lng.toFixed(2);
        zoomVal.textContent = map.getZoom();
    };

    map.on('mousemove', updateContextInfo);
    map.on('zoomend', updateContextInfo);
    map.on('moveend', updateContextInfo);
    updateContextInfo({ latlng: map.getCenter() });

    const toolBtns = document.querySelectorAll('.tool-btn');
    const controlPanel = document.getElementById('control-panel');
    const panelTitle = document.getElementById('panel-title');
    const panelContent = document.getElementById('panel-content');
    const closePanelBtn = document.getElementById('close-panel-btn');

    let activePanel = null;
    let selectionRectangle = null;
    let isDrawing = false;
    let startPoint;
    let geminiResultsLayer = L.layerGroup().addTo(map);

    const panelTemplates = {
        layers: {
            title: 'Camadas de Dados',
            content: `
                <div class="flex flex-col gap-4 text-sm">
                    <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" class="accent-[#00F6FF] w-4 h-4 bg-transparent border-white/50 rounded" checked> Topografia</label>
                    <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" class="accent-[#00F6FF] w-4 h-4 bg-transparent border-white/50 rounded"> Composição Mineral</label>
                    <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" class="accent-[#00F6FF] w-4 h-4 bg-transparent border-white/50 rounded" disabled> Temperatura (offline)</label>
                </div>
            `
        },
        ai: {
            title: 'Análise IA',
            content: `
                <div class="flex flex-col gap-4">
                    <p class="text-sm text-white/70">A ferramenta de Análise IA está ativa. Clique e arraste no mapa para selecionar uma região e identificar feições automaticamente.</p>
                    <button id="start-analysis-btn" class="w-full bg-[#00F6FF] text-[#0D1117] font-bold py-2 rounded-md hover:bg-opacity-80 transition-all">Análise Desativada</button>
                </div>
            `
        }
    };

    const openPanel = (panelName) => {
        const template = panelTemplates[panelName];
        if (!template) return;
        
        panelTitle.textContent = template.title;
        panelContent.innerHTML = template.content;
        controlPanel.classList.add('active');
        activePanel = panelName;

        if (panelName === 'ai') {
            map.getContainer().style.cursor = 'crosshair';
        }
    };
    
    const closePanel = () => {
        controlPanel.classList.remove('active');
        toolBtns.forEach(b => b.classList.remove('active'));
        map.getContainer().style.cursor = '';
        if (selectionRectangle) {
            map.removeLayer(selectionRectangle);
            selectionRectangle = null;
        }
        activePanel = null;
    };

    toolBtns.forEach(btn => {
        if(btn.dataset.panel) {
            btn.addEventListener('click', () => {
                const panelName = btn.dataset.panel;
                if (activePanel === panelName) {
                    closePanel();
                } else {
                    closePanel(); 
                    btn.classList.add('active');
                    openPanel(panelName);
                }
            });
        }
    });

    closePanelBtn.addEventListener('click', closePanel);

    const arBtn = document.getElementById('btn-ar');
    const arModal = document.getElementById('ar-modal');
    const closeArModalBtn = document.getElementById('close-ar-modal-btn');
    arBtn.addEventListener('click', () => { closePanel(); arModal.classList.remove('hidden'); });
    closeArModalBtn.addEventListener('click', () => arModal.classList.add('hidden'));
    
    const geminiBtn = document.getElementById('btn-gemini');
    const geminiModal = document.getElementById('gemini-modal');
    const closeGeminiModalBtn = document.getElementById('close-gemini-modal-btn');
    const geminiSubmitBtn = document.getElementById('gemini-submit-btn');
    const geminiPrompt = document.getElementById('gemini-prompt');
    const loaderOverlay = document.getElementById('loader-overlay');
    const loaderText = document.getElementById('loader-text');

    geminiBtn.addEventListener('click', () => { closePanel(); geminiModal.classList.remove('hidden'); });
    closeGeminiModalBtn.addEventListener('click', () => geminiModal.classList.add('hidden'));

    async function callGeminiAPI(prompt) {
        geminiModal.classList.add('hidden');
        loaderText.textContent = "Consultando Gemini...";
        loaderOverlay.classList.remove('hidden');
        
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`Mock API Call for prompt: "${prompt}"`);
                const bounds = map.getBounds();
                const mockResults = [
                    { lat: bounds.getCenter().lat + 50, lng: bounds.getCenter().lng, label: "Formação A" },
                    { lat: Math.random() * 400 - 200, lng: Math.random() * 400 - 200, label: "Anomalia B" },
                    { lat: Math.random() * 400 - 200, lng: Math.random() * 400 - 200, label: "Cratera C (identificada por Gemini)" },
                ];
                resolve(mockResults);
            }, 3000);
        });
    }

    geminiSubmitBtn.addEventListener('click', async () => {
        const prompt = geminiPrompt.value;
        if (!prompt) return;

        const results = await callGeminiAPI(prompt);
        
        geminiResultsLayer.clearLayers();
        results.forEach(res => {
            L.circleMarker([res.lat, res.lng], { 
                color: '#FFB800', 
                radius: 10,
                fillColor: '#FFB800',
                fillOpacity: 0.5
            }).addTo(geminiResultsLayer)
              .bindPopup(`<b>${res.label}</b><br>Identificado via Gemini com base em: "${prompt}"`).openPopup();
        });

        loaderOverlay.classList.add('hidden');
        geminiPrompt.value = '';
    });

    map.on('mousedown', (e) => {
        if (activePanel !== 'ai') return;
        isDrawing = true;
        startPoint = e.latlng;

        if (selectionRectangle) {
            map.removeLayer(selectionRectangle);
        }
        selectionRectangle = L.rectangle([startPoint, startPoint], {
            color: "#FFB800",
            weight: 2,
            fillOpacity: 0.1,
            dashArray: '5, 5'
        }).addTo(map);
    });

    map.on('mousemove', (e) => {
        if (!isDrawing) return;
        selectionRectangle.setBounds(L.latLngBounds(startPoint, e.latlng));
    });

    map.on('mouseup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        loaderText.textContent = "Analisando região...";
        loaderOverlay.classList.remove('hidden');
        setTimeout(() => {
            loaderOverlay.classList.add('hidden');
            if (selectionRectangle) {
                selectionRectangle.setStyle({ className: 'pulsing-border' });
                const bounds = selectionRectangle.getBounds();
                L.circleMarker(bounds.getCenter(), { color: '#00F6FF', radius: 8 }).addTo(map)
                    .bindPopup('Cratera Identificada').openPopup();
            }
            closePanel();
        }, 2500);
    });
});