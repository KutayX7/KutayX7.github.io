
// Constants
const UNDO_MAX_STEPS = 256; // Good enough for almost all cases without sacrificing too much memory

const canvasesParent = document.getElementById("canvas-parent");
const clearButton = document.getElementById("button-clear-canvas");
const undoButton = document.getElementById("button-undo");
const redoButton = document.getElementById("button-redo");
const resetViewButton = document.getElementById("button-reset-view");
const downloadButton = document.getElementById("button-download-image");
const inputPenColor = document.getElementById("input-pen-color");
const inputAlpha = document.getElementById("input-pen-alpha");
const inputPenSize = document.getElementById("input-pen-size");
const inputWidth = document.getElementById("input-width");
const inputHeight = document.getElementById("input-height");
const inputPathSmoothing = document.getElementById("input-path-smoothing");

const searchParams = new URLSearchParams(document.location.search);
const baseImageURL = searchParams.get("src");
const contextMenus = [];
const layerBaseData = []; // fallback data for the undo
const undoStack = [];
const redoStack = [];
const pathPointsX = [];
const pathPointsY = [];
const pathPointsRadius = [];

// Variables
let width = 1120;
let height = 630;
let painting = false;

let penColor = "#000000";
let refBuffer = null;
let contextMenuSubject = "";
let pointerOnCanvas = false;
let penOnly = false;
let primaryPointerId = null;
let penX = 0;
let penY = 0;
let penTargetIndex = 0;
let activeTouchCount = 0;
let selectedLayer = 0;
let dragging = false;
let translationX = 0;
let translationY = 0;
let scale = 1;
let maxScale = 1;
let minScale = 1;

// Functions
function getCanvases() {
    let canvases = [];
    for (const canvas of canvasesParent.querySelectorAll('canvas')) {
        canvases.push(canvas);
    }
    return canvases;
}

function getCanvas(layer) {
    return getCanvases()[layer];
}

function getContext(layer) {
    return getCanvas(layer).getContext("2d");
}

function saveUndo(layer) {
    if (layer == undefined) layer = selectedLayer;
    const ctx = getContext(layer);
    if (
        undoStack.push(
            {
                layer: layer,
                data: ctx.getImageData(0, 0, width, height)
            }
        ) > UNDO_MAX_STEPS + 1
    ) {
        let oldSnapshot = undoStack.shift();
        let found = false;
        for (const snapshot of undoStack) {
            if (snapshot.layer == oldSnapshot.layer) {
                found = true;
                break;
            }
        }
        if (!found) {
            layerBaseData[oldSnapshot.layer] = oldSnapshot.data;
        }
    }
    redoStack.length = 0;
}

function endPainting(cancel) {
    painting = false;
    penOnly = false;
    primaryPointerId = null;
    if (!cancel) {
        saveUndo();
    }
}

function pointerupHandler(e) {
    if (painting && e.pointerId == primaryPointerId) { // End of stroke
        endPainting();
    }
}

function translateBy(dX, dY) {
    const baseCanvas = getCanvas(0);
    translationX += dX;
    translationY += dY;
    baseCanvas.style.translate = `${translationX}px ${translationY}px`;
}

function scaleBy(dScale, originX, originY) {
    const baseCanvas = getCanvas(0);
    const containerRect = canvasesParent.getBoundingClientRect();
    const canvasRect = baseCanvas.getBoundingClientRect();
    const oldScale = scale;
    const newScale = Math.min(Math.max(scale * dScale, minScale), maxScale);
    scale = newScale;
    dScale = newScale/oldScale;
    originX = originX == undefined ? (containerRect.left + containerRect.right)/2 : originX;
    originY = originY == undefined ? (containerRect.top + containerRect.bottom)/2 : originY;
    let dX = (canvasRect.left + canvasRect.right)/2 - originX;
    let dY = (canvasRect.top + canvasRect.bottom)/2 - originY;

    translateBy(-dX, -dY);
    translateBy(dX * dScale, dY * dScale);

    baseCanvas.style.scale = `${scale}`;
}

function resetTransform() {
    const baseCanvas = getCanvas(0);
    const rect = canvasesParent.getBoundingClientRect();
    const maxHeight = rect.height;
    const maxWidth = rect.width;
    translationX = (width  - maxWidth ) / -2;
    translationY = (height - maxHeight) / -2;
    scale = Math.min(maxWidth/width, maxHeight/height) * 0.95;
    minScale = scale * 0.25;
    maxScale = scale * Math.max(width, height) / 16;
    baseCanvas.style.translate = `${translationX}px ${translationY}px`;
    baseCanvas.style.scale = `${scale}`;
}

function pointermoveHandler(e) {
    e.preventDefault();
    const penDown = e.pressure > 0;
    const isPen = e.pointerType == 'pen';
    const isMouse = e.pointerType == 'mouse';
    const isTouch = e.pointerType == 'touch';
    const canvas = getCanvas(selectedLayer);
    const ctx = getContext(selectedLayer);
    const primaryButtonDown = e.buttons % 2 == 1;
    let penRadius = inputPenSize.value * e.pressure;

    if (isMouse) {
        penRadius *= 2;
    }

    if (isTouch) {
        if (activeTouchCount == 2) {
            // TODO: Handle panning
            const dx = e.movementX / 2;
            const dy = e.movementY / 2;
            // ...
        } else if (activeTouchCount > 1) {
            return;
        }
    }

    const rect = canvas.getBoundingClientRect();
    const X = (e.clientX - rect.x) / scale;
    const Y = (e.clientY - rect.y) / scale;

    if (penOnly && !isPen) return; // Ignore unrelated touch events (such as palm).
    if ((isTouch || isPen) && !e.isPrimary) return; // Ignore secondary touches
    if (painting && !penDown) { // End of stroke
        endPainting();
    }
    else if (
        !painting &&
        !(isMouse && !primaryButtonDown) &&
        penDown &&
        pointerOnCanvas &&
        activeTouchCount <= 1
    ) { // Start of stroke
        if (isPen) {
            penOnly = true;
        }
        primaryPointerId = e.pointerId;
        refBuffer = ctx.getImageData(0, 0, width, height);
        painting = true;
        pathPointsX.length = 0;
        pathPointsY.length = 0;
        pathPointsRadius.length = 0;
        pathPointsX[0] = X;
        pathPointsY[0] = Y;
        pathPointsRadius[0] = penRadius;
        ctx.lineCap = "round";
        ctx.lineJoin= "round";
        ctx.strokeStyle = penColor;
        ctx.fillStyle = penColor;
        ctx.globalAlpha = inputAlpha.value / 100;
        penX = X;
        penY = Y;
        penTargetIndex = 0;
    }

    if (painting) {
        pathPointsX.push(X);
        pathPointsY.push(Y);
        pathPointsRadius.push(penRadius);
        const pointCount = pathPointsX.length;
        let smoothingDistance = inputPathSmoothing.value || 1;
        let stepLength = 1;
        if (smoothingDistance < 1) {
            smoothingDistance = 1;
        }

        while (penTargetIndex < pointCount) {
            let targetX = pathPointsX[penTargetIndex];
            let targetY = pathPointsY[penTargetIndex];
            let radius = pathPointsRadius[penTargetIndex];
            let dirX = targetX - penX;
            let dirY = targetY - penY;
            let length = Math.sqrt(dirX * dirX + dirY * dirY);

            if (length < smoothingDistance) {
                penTargetIndex++;
            }
            ctx.beginPath();
            ctx.arc(penX, penY, radius/2, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fill();

            if (length > 0.01) {
                penX = penX + dirX / length;
                penY = penY + dirY / length;
            }
        }
    } else if (dragging) {
        translateBy(e.movementX, e.movementY);
    }
}

function mousedownHandler(e) {
    if (e.button == 1) {
        e.preventDefault();
        dragging = true;
        canvasesParent.style.cursor = 'grabbing';
    }
}

function mouseupHandler(e) {
    if (e.button == 1) {
        e.preventDefault();
        dragging = false;
        canvasesParent.style.cursor = 'auto';
    }
}

function clearCanvas() {
    width = inputWidth.value;
    height = inputHeight.value;
    layerBaseData.length = 0;
    undoStack.length = 0;
    redoStack.length = 0;

    for (const canvas of getCanvases()) {
        canvas.remove();
    }

    let baseCanvas = document.createElement('canvas');
    baseCanvas.width = width;
    baseCanvas.height = height;
    canvasesParent.append(baseCanvas);

    for (const canvas of getCanvases()) {
        const ctx = canvas.getContext("2d");
        canvas.width = width;
        canvas.height = height;
        canvas.draggable = false;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.imageRendering = 'pixelated';
        ctx.fillStyle = 'white';
    }

    getContext(0).fillRect(0, 0, width, height);
    saveUndo(0);
    resetTransform();
}

function reloadLayer(layer) {
    const ctx = getContext(layer);
    const baseData = layerBaseData[layer];
    for (let i = undoStack.length - 1; i >= 0; i--) {
        if (undoStack[i].layer == layer) {
            ctx.putImageData(undoStack[i].data, 0, 0);
            return;
        }
    }
    if (baseData) {
        ctx.putImageData(baseData, 0, 0);
    }
}

function undo() {
    if (undoStack.length > 1) {
        let snapshot = undoStack.pop();
        let layer = snapshot.layer;
        redoStack.push(snapshot);
        reloadLayer(layer);
    }
}

function redo() {
    if (redoStack.length > 0) {
        let snapshot = redoStack.pop();
        let layer = snapshot.layer;
        undoStack.push(snapshot);
        reloadLayer(layer);
    }
}

function keyDownHandler(e) {
    const key = e.key.toLowerCase();
    if (painting) {

    } else {
        if (e.ctrlKey && key == 'z') {
            undo();
        }
        if (e.ctrlKey && key == 'y') {
            redo();
        }
    }
    if (e.ctrlKey && key == '0') {
        resetTransform();
    }
}

function loadImageFromURL(url) {
    console.log("Loading image from URL: ", url);
    let image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = function () {
        inputWidth.value = image.width;
        inputHeight.value = image.height;
        clearCanvas();
        const ctx = getContext(0)
        ctx.drawImage(image, 0, 0);
        saveUndo(0);
        layerBaseData[0] = ctx.getImageData(0, 0, width, height);
        console.log("Image loaded successfully!");
    };

    image.src = url;
}

// Add event listeners
canvasesParent.addEventListener("pointerenter", () => {
    pointerOnCanvas = true;
});
canvasesParent.addEventListener("pointerleave", () => {
    pointerOnCanvas = false;
    if (dragging) {
        dragging = false;
        canvasesParent.style.cursor = 'auto';
    }
});
canvasesParent.addEventListener('mousedown', mousedownHandler);
canvasesParent.addEventListener('mouseup', mouseupHandler);

window.addEventListener("pointermove", pointermoveHandler);
window.addEventListener("pointerup", pointerupHandler);
window.addEventListener("pointercancel", pointerupHandler);
window.addEventListener('keydown', keyDownHandler);

clearButton.addEventListener("click", () => {
    if (painting) return;
    if (undoStack.length <= 1) {
        clearCanvas();
    } else if (window.confirm("Are you sure that you want to clear the canvas? This can't be undone.")) {
        clearCanvas();
    }
});

undoButton.addEventListener('click', () => {
    if (painting) return;
    undo();
});

redoButton.addEventListener('click', () => {
    if (painting) return;
    redo();
});

resetViewButton.addEventListener('click', () => {
    resetTransform();
})

downloadButton.addEventListener("click", (e) => {
    if (painting) return;
    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = width;
    saveCanvas.height = height;
    const saveCtx = saveCanvas.getContext('2d');
    for (const canvas of getCanvases()) {
        saveCtx.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
    }

    let url = saveCanvas.toDataURL("image/png");
    let a = document.createElement("a");
    a.href = url;
    a.download = "drawing.png";
    a.type = "image/png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    saveCanvas.remove();
});

inputPenColor.addEventListener("input", (e) => {
    penColor = e.target.value;
});

canvasesParent.addEventListener('touchstart', function(e) {
    activeTouchCount = e.targetTouches.length;
    if (activeTouchCount == 2) {
        undo();
    }
    if (activeTouchCount == 3) {
        redo(redo()); // i'm not sure why but I don't care :)
    }
});

// Canvas zoom with mouse wheel
canvasesParent.addEventListener('wheel', function(e) {
    e.preventDefault();
    const FACTOR = 5/4;

    if (e.ctrlKey) {
        if (e.deltaY > 0) {
            scaleBy(1/FACTOR, e.clientX, e.clientY);
        } else {
            scaleBy(FACTOR, e.clientX, e.clientY);
        }
    } else if (e.shiftKey) {
        // TODO: Rotate canvas
    } else {
        if (e.deltaY > 0) {
            inputPenSize.value = Math.max(1, inputPenSize.value - 1);
        } else {
            inputPenSize.value++;
        }
    }


});

// Ask the user if they are sure about leaving
window.addEventListener('beforeunload', (e) => {
    if (undoStack.length > 1) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Prevent default zooming with mouse
window.addEventListener('wheel', function(e) {
    if (e.ctrlKey === true || e.metaKey === true) {
        e.preventDefault();
    }
}, { passive: false });

// Initialize stuff
canvasesParent.style.touchAction = 'none';
inputPenSize.value = 5;
inputPenColor.value = penColor;
inputAlpha.value = 100;
inputWidth.value = width;
inputHeight.value = height;
clearCanvas();
if (baseImageURL && baseImageURL.length > 0) { // Load a base image if provided in the URL
    loadImageFromURL(baseImageURL);
}
