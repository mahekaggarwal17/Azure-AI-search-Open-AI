/* ==========================================================================
   KORTEX RAG AI CONSOLE — CLIENT ENGINE (ANTIGRAVITY EDITION)
   ========================================================================== */

let vectorNodes = [];
let queryNode = null;
let animationFrameId = null;

// Antigravity Motion States
let mouseX = 0, mouseY = 0;
let trailX = 0, trailY = 0;

document.addEventListener('DOMContentLoaded', () => {
    fetchCurrentDocument();
    setupDragAndDrop();
    initVectorCanvas();
    initMosaicWave();
    initAntigravityMotion();
});

function scrollToDocWorkspace() {
    const el = document.getElementById('doc-workspace');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollToAI(promptText = null) {
    const el = document.getElementById('ai-assistant');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    if (promptText) {
        const input = document.getElementById('chatInput');
        if (input) {
            input.value = promptText;
            input.focus();
        }
    }
}

/* ==========================================================================
   DOCUMENT UPLOAD & PREVIEW LOGIC
   ========================================================================== */
async function fetchCurrentDocument() {
    try {
        const res = await fetch('/api/current-document');
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Failed fetching active document:", err);
    }
}

function updateDocPreview(doc) {
    if (!doc) return;
    const titleEl = document.getElementById('docTitle');
    const typePill = document.getElementById('docTypePill');
    const pagesEl = document.getElementById('docPages');
    const chunksEl = document.getElementById('docChunks');
    const previewEl = document.getElementById('docPreviewText');
    const indicatorEl = document.getElementById('chatDocIndicator');

    if (titleEl) titleEl.textContent = doc.filename || 'Active_Document.pdf';
    if (typePill) typePill.textContent = doc.file_type || 'PDF';
    if (pagesEl) pagesEl.textContent = doc.pages || '1';
    if (chunksEl) chunksEl.textContent = doc.chunk_count || '12';
    if (previewEl) previewEl.textContent = doc.preview_text || 'Document parsed successfully.';
    if (indicatorEl) indicatorEl.textContent = `📄 Active: ${doc.filename || 'Document'}`;

    // Reset Query Visuals on Document Switch
    queryNode = null;
    generateRandomNodes();

    if (doc.chunks && Array.isArray(doc.chunks)) {
        updateInspector(doc.chunks, doc.filename);
    }
}

async function loadSampleDocument(docName, btnEl) {
    document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    try {
        const res = await fetch('/api/select-sample-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_name: docName })
        });
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Error switching sample document:", err);
    }
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFileToServer(files[0]);
        }
    });
}

function handleFileUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        uploadFileToServer(files[0]);
    }
}

async function uploadFileToServer(file) {
    const titleEl = document.getElementById('docTitle');
    const previewEl = document.getElementById('docPreviewText');
    if (titleEl) titleEl.textContent = "Uploading " + file.name + "...";
    if (previewEl) previewEl.textContent = "Ingesting, parsing paragraphs, and indexing vectors...";

    try {
        const res = await fetch('/api/upload-document', {
            method: 'POST',
            headers: { 'X-File-Name': file.name },
            body: file
        });
        if (res.ok) {
            const doc = await res.json();
            updateDocPreview(doc);
        }
    } catch (err) {
        console.error("Upload failed:", err);
        if (previewEl) previewEl.textContent = "Error parsing document. Please try again.";
    }
}

/* ==========================================================================
   RAG CHAT & MARKDOWN FORMATTING
   ========================================================================== */
function askDirectPrompt(promptText) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = promptText;
        submitChatQuery(promptText);
    }
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFormSubmit(e);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    submitChatQuery(query);
}

async function submitChatQuery(query) {
    const input = document.getElementById('chatInput');
    if (input) input.value = '';

    appendMessage(query, 'user');
    const loadingId = appendMessage("Searching document paragraphs and synthesizing grounded answer...", 'assistant', true);

    try {
        const res = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, doc_context: true })
        });

        const data = await res.json();
        removeMessage(loadingId);

        appendMessage(data.response || "No response received.", 'assistant');
        if (data.chunks) {
            updateInspector(data.chunks, data.document || "Active Document");
            triggerVectorSearchVisualization(data.chunks);
        }
    } catch (err) {
        removeMessage(loadingId);
        appendMessage("Network error querying document RAG engine. Please check connection.", 'assistant');
    }
}

function parseMarkdownToHtml(md) {
    if (!md) return '';

    // Convert Blockquote Grounded Execution Header
    let html = md.replace(/^> \*\*(.*?)\*\* (.*?)$/gm, '<div class="rag-badge-box"><strong>$1</strong> • $2</div>');

    // Convert Citations [Citation: ...] into Interactive Pill Badges
    html = html.replace(/\[Citation:\s*(.*?)\]/g, '<span class="citation-pill">📌 $1</span>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italics
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Inline Code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Bullet points
    const lines = html.split('\n');
    let inList = false;
    let out = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('- ')) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${line.substring(2)}</li>`);
        } else {
            if (inList) {
                out.push('</ul>');
                inList = false;
            }
            if (line.length > 0 && !line.startsWith('<div') && !line.startsWith('<h') && !line.startsWith('<ul') && !line.startsWith('<li')) {
                out.push(`<p>${line}</p>`);
            } else {
                out.push(line);
            }
        }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
}

function appendMessage(text, role, isLoading = false) {
    const stream = document.getElementById('chatStream');
    if (!stream) return null;

    const msgId = 'msg-' + Math.random().toString(36).substring(2, 9);
    const div = document.createElement('div');
    div.className = `message ${role}-msg`;
    div.id = msgId;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? '👤' : '⚡';

    const content = document.createElement('div');
    content.className = 'msg-content';

    if (role === 'user') {
        content.textContent = text;
    } else {
        if (isLoading) {
            content.innerHTML = `<div class="markdown-body"><p><em>⏳ ${text}</em></p></div>`;
        } else {
            content.innerHTML = `<div class="markdown-body">${parseMarkdownToHtml(text)}</div>`;
        }
    }

    div.appendChild(avatar);
    div.appendChild(content);
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;

    return msgId;
}

function removeMessage(msgId) {
    if (!msgId) return;
    const el = document.getElementById(msgId);
    if (el) el.remove();
}

function clearChat() {
    const stream = document.getElementById('chatStream');
    if (!stream) return;
    stream.innerHTML = `
        <div class="message assistant-msg">
            <div class="msg-avatar">⚡</div>
            <div class="msg-content">
                <div class="markdown-body">
                    <h3>Document Workspace Cleared</h3>
                    <p>Ready for your next document inquiry. Ask anything below!</p>
                </div>
            </div>
        </div>
    `;
    queryNode = null;
    vectorNodes.forEach(n => n.highlighted = false);
}

function updateInspector(chunks, docName = "Active Document") {
    const container = document.getElementById('chunkContainer');
    const badge = document.getElementById('chunkBadge');
    if (!container) return;

    if (badge) badge.textContent = `${chunks ? chunks.length : 0} Chunks from ${docName}`;

    if (!chunks || chunks.length === 0) {
        container.innerHTML = `
            <div class="empty-inspector">
                <p>No document chunks retrieved yet.</p>
                <span>Ask a question to inspect semantic vector matches.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = chunks.map((c, i) => `
        <div class="chunk-item">
            <div class="chunk-top">
                <span class="chunk-id">Excerpts • Chunk #${c.id || i + 1}</span>
                <span class="chunk-score">Score: ${(c.score || 0.94).toFixed(3)}</span>
            </div>
            <div class="chunk-text">${c.content || 'Document content excerpt...'}</div>
        </div>
    `).join('');
}

/* ==========================================================================
   INTERACTIVE VECTOR CANVAS SIMULATOR
   ========================================================================== */
function initVectorCanvas() {
    const canvas = document.getElementById('vectorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        generateRandomNodes();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    startCanvasAnimation();
}

function generateRandomNodes() {
    const canvas = document.getElementById('vectorCanvas');
    if (!canvas) return;
    vectorNodes = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
        vectorNodes.push({
            id: i + 1,
            x: Math.random() * (canvas.width - 40) + 20,
            y: Math.random() * (canvas.height - 40) + 20,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            baseRadius: 4 + Math.random() * 3,
            radius: 4,
            color: '#06b6d4',
            pulse: Math.random() * Math.PI,
            label: `Chunk #${i+1}`,
            highlighted: false,
            score: 0
        });
    }
}

function startCanvasAnimation() {
    const canvas = document.getElementById('vectorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw sub-grid lines
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.03)';
        ctx.lineWidth = 1;
        const gridSpacing = 20;
        for (let x = 0; x < canvas.width; x += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw node connections for the general cluster
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < vectorNodes.length; i++) {
            for (let j = i + 1; j < vectorNodes.length; j++) {
                const dist = Math.hypot(vectorNodes[i].x - vectorNodes[j].x, vectorNodes[i].y - vectorNodes[j].y);
                if (dist < 80) {
                    ctx.beginPath();
                    ctx.moveTo(vectorNodes[i].x, vectorNodes[i].y);
                    ctx.lineTo(vectorNodes[j].x, vectorNodes[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw & Move Document Chunk Nodes
        vectorNodes.forEach(node => {
            node.x += node.vx;
            node.y += node.vy;

            // Boundaries bounce
            if (node.x < 15 || node.x > canvas.width - 15) node.vx *= -1;
            if (node.y < 15 || node.y > canvas.height - 15) node.vy *= -1;

            node.pulse += 0.02;
            const sizeOffset = Math.sin(node.pulse) * 1.2;
            node.radius = node.baseRadius + (node.highlighted ? sizeOffset + 2 : sizeOffset * 0.4);

            if (node.highlighted) {
                // Outer glowing circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
                ctx.fill();

                ctx.fillStyle = '#22d3ee';
            } else {
                ctx.fillStyle = 'rgba(139, 92, 246, 0.5)';
            }

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();

            // Label text
            ctx.fillStyle = node.highlighted ? '#22d3ee' : '#8e87a5';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(node.label, node.x, node.y - node.radius - 3);
        });

        // Draw Query Node & Vector Connections
        if (queryNode) {
            queryNode.pulse += 0.04;
            const qRadius = 7 + Math.sin(queryNode.pulse) * 1.5;

            // Outer glowing ring
            ctx.beginPath();
            ctx.arc(queryNode.x, queryNode.y, qRadius + 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(queryNode.x, queryNode.y, qRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#ec4899';
            ctx.fill();

            // Draw Q label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('QUERY', queryNode.x, queryNode.y - qRadius - 3);

            // Connect Query Node to Highlighted Citations
            vectorNodes.forEach(node => {
                if (node.highlighted) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([3, 3]);
                    ctx.moveTo(queryNode.x, queryNode.y);
                    ctx.lineTo(node.x, node.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Show Cosine Similarity Score on Connection Line
                    const midX = (queryNode.x + node.x) / 2;
                    const midY = (queryNode.y + node.y) / 2;
                    ctx.fillStyle = '#22d3ee';
                    ctx.font = 'bold 8px monospace';
                    ctx.fillText(node.score, midX, midY - 3);
                }
            });
        }

        animationFrameId = requestAnimationFrame(animate);
    }

    animate();
}

function triggerVectorSearchVisualization(chunks) {
    const canvas = document.getElementById('vectorCanvas');
    if (!canvas) return;

    // Place the Query Core Node in Center of Visual Space
    queryNode = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        pulse: 0
    };

    // Reset node highlights
    vectorNodes.forEach(n => {
        n.highlighted = false;
    });

    // Match chunks returning from API to specific index of visualization nodes
    if (chunks && Array.isArray(chunks)) {
        chunks.forEach((chunk, index) => {
            const nodeIndex = (chunk.id - 1) % vectorNodes.length;
            const node = vectorNodes[nodeIndex];
            if (node) {
                node.highlighted = true;
                node.score = (chunk.score || 0.94).toFixed(3);
                node.label = `Match #${chunk.id} (${node.score})`;
            }
        });
    }
}

/* ==========================================================================
   DYNAMIC DOUBLE-HELIX MOSAIC GENERATION
   ========================================================================== */
function initMosaicWave() {
    const container = document.getElementById('waveContainer');
    if (!container) return;

    container.innerHTML = '';
    
    // Varieties of cards to fill the mosaic helix
    const cellContents = [
        // 0: PDF Document Icon
        '<div class="mosaic-cell cell-doc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>',
        // 1: DOCX Document Icon
        '<div class="mosaic-cell cell-doc docx"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div>',
        // 2: Embedding dimension
        '<div class="mosaic-cell cell-metric"><span class="metric-val">1536</span><span class="metric-lbl">dims</span></div>',
        // 3: Cosine similarity score
        '<div class="mosaic-cell cell-metric"><span class="metric-val">0.99</span><span class="metric-lbl">cosine</span></div>',
        // 4: Miniature Code block lines
        '<div class="mosaic-cell cell-code"><div class="code-line violet" style="width: 80%;"></div><div class="code-line cyan" style="width: 50%;"></div><div class="code-line magenta" style="width: 70%;"></div></div>',
        // 5: Miniature column chart representation
        '<div class="mosaic-cell cell-chart"><div class="chart-bar active" style="height: 35%;"></div><div class="chart-bar" style="height: 65%;"></div><div class="chart-bar active" style="height: 80%;"></div><div class="chart-bar" style="height: 50%;"></div></div>',
        // 6: K=5 indicator
        '<div class="mosaic-cell cell-metric"><span class="metric-val">K=5</span><span class="metric-lbl">search</span></div>',
        // 7: API symbol
        '<div class="mosaic-cell cell-metric"><span class="metric-val">RAG</span><span class="metric-lbl">studio</span></div>'
    ];

    const cellCountPerStrand = 12;
    const waveWidth = 85; // Percentage of container width
    const startLeft = 8;  // Starting left percentage

    // Build Strand A
    for (let i = 0; i < cellCountPerStrand; i++) {
        const fraction = i / (cellCountPerStrand - 1);
        const left = startLeft + fraction * waveWidth;
        
        // Sine wave calculations
        const angle = fraction * Math.PI * 2.2;
        const top = 50 + Math.sin(angle) * 35; // height amplitude 35%
        
        // 3D Depth Scale & Opacity using Cosine
        const depthVal = Math.cos(angle); // -1 (far background) to 1 (close foreground)
        const scale = 0.75 + (depthVal + 1) * 0.22;
        const opacity = 0.45 + (depthVal + 1) * 0.27;
        const zIndex = Math.round((depthVal + 1) * 10) + 5;

        // Choose content variety
        const contentHTML = cellContents[i % cellContents.length];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHTML;
        const cell = tempDiv.firstChild;

        // Apply styles
        cell.style.left = `${left}%`;
        cell.style.top = `${top}%`;
        cell.style.transform = `scale(${scale}) translateZ(${depthVal * 25}px)`;
        cell.style.opacity = opacity;
        cell.style.zIndex = zIndex;
        cell.setAttribute('data-depth', depthVal);

        container.appendChild(cell);
    }

    // Build Strand B (Phase shifted by 180 degrees)
    for (let i = 0; i < cellCountPerStrand; i++) {
        const fraction = i / (cellCountPerStrand - 1);
        const left = startLeft + fraction * waveWidth;
        
        // Phase shift: add Math.PI (180 degrees)
        const angle = fraction * Math.PI * 2.2 + Math.PI;
        const top = 50 + Math.sin(angle) * 35;
        
        const depthVal = Math.cos(angle);
        const scale = 0.75 + (depthVal + 1) * 0.22;
        const opacity = 0.45 + (depthVal + 1) * 0.27;
        const zIndex = Math.round((depthVal + 1) * 10) + 5;

        // Shift variety offset
        const contentHTML = cellContents[(i + 3) % cellContents.length];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHTML;
        const cell = tempDiv.firstChild;

        cell.style.left = `${left}%`;
        cell.style.top = `${top}%`;
        cell.style.transform = `scale(${scale}) translateZ(${depthVal * 25}px)`;
        cell.style.opacity = opacity;
        cell.style.zIndex = zIndex;
        cell.setAttribute('data-depth', depthVal);

        container.appendChild(cell);
    }
}

/* ==========================================================================
   S-TIER ANTIGRAVITY MOTION & KINETIC EFFECTS ENGINE
   ========================================================================== */
function initAntigravityMotion() {
    // 1. Cursor trail follower with inertia (lerp)
    const trail = document.getElementById('cursorTrail');
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.pageX;
        mouseY = e.pageY;
    });

    function updateCursorTrail() {
        trailX += (mouseX - trailX) * 0.15;
        trailY += (mouseY - trailY) * 0.15;
        
        if (trail) {
            trail.style.left = `${trailX}px`;
            trail.style.top = `${trailY}px`;
        }
        
        requestAnimationFrame(updateCursorTrail);
    }
    requestAnimationFrame(updateCursorTrail);

    // Disable motion effects if prefers-reduced-motion is active
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
        if (trail) trail.style.display = 'none';
        return;
    }

    // 2. Dynamic Background Parallax Aurora
    const aurora1 = document.getElementById('aurora1');
    const aurora2 = document.getElementById('aurora2');
    const aurora3 = document.getElementById('aurora3');

    document.addEventListener('mousemove', (e) => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;

        // Move different backdrops by varying layers
        if (aurora1) aurora1.style.transform = `translate(${dx * 0.04}px, ${dy * 0.04}px)`;
        if (aurora2) aurora2.style.transform = `translate(${-dx * 0.02}px, ${-dy * 0.02}px)`;
        if (aurora3) aurora3.style.transform = `translate(${dx * 0.03}px, ${-dy * 0.03}px)`;
    });

    // 3. Kinetic 3D Card Tilting (Float, Peek & Mosaic Cells)
    const container = document.body;
    container.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.float-card, .peek-card, .mosaic-cell');
        
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // Check if mouse is hovering card
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const cardX = e.clientX - rect.left;
                const cardY = e.clientY - rect.top;
                
                const normX = (cardX / rect.width) - 0.5;
                const normY = (cardY / rect.height) - 0.5;
                
                const rotateX = -normY * 16;
                const rotateY = normX * 16;
                
                // Get depth factor if it's a mosaic cell to preserve its scale
                const depthVal = card.getAttribute('data-depth');
                if (depthVal !== null) {
                    const baseScale = 0.75 + (parseFloat(depthVal) + 1) * 0.22;
                    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${baseScale * 1.25}) translateZ(${depthVal * 25 + 20}px)`;
                } else {
                    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) translateZ(15px)`;
                }
                card.style.boxShadow = `${-normX * 16}px ${16 - normY * 8}px 32px rgba(6, 182, 212, 0.25)`;
            }
        });
    });

    // Reset card transforms on mouseleave (delegated since mosaic cells are dynamic)
    document.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.float-card, .peek-card, .mosaic-cell');
        if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
            const depthVal = card.getAttribute('data-depth');
            if (depthVal !== null) {
                const baseScale = 0.75 + (parseFloat(depthVal) + 1) * 0.22;
                card.style.transform = `scale(${baseScale}) translateZ(${depthVal * 25}px)`;
            } else {
                card.style.transform = '';
            }
            card.style.boxShadow = '';
        }
    });

    // 4. Magnetic Buttons (Pull buttons slightly toward mouse)
    const magneticBtns = document.querySelectorAll('.magnetic-target');
    magneticBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const btnX = e.clientX - rect.left;
            const btnY = e.clientY - rect.top;
            
            const normX = (btnX / rect.width) - 0.5;
            const normY = (btnY / rect.height) - 0.5;
            
            const pullX = normX * 12;
            const pullY = normY * 12;
            
            btn.style.transform = `translate(${pullX}px, ${pullY}px) scale(1.02)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
        });
    });
}
