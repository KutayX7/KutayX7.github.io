
// Constants
const UNDO_MAX_STEPS = 256; // Good enough for almost all cases without sacrificing too much memory

const canvasesParent = document.getElementById("paint-viewport");
const rootCanvas = document.getElementById("root-canvas"); // Not actually a canvas!
const clearButton = document.getElementById("button-clear-canvas");
const undoButton = document.getElementById("button-undo");
const redoButton = document.getElementById("button-redo");
const resetViewButton = document.getElementById("button-reset-view");
const fullscreenButton = document.getElementById("button-fullscreen");
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
const pointerPositions = new Map();

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
let rotation = 0;
let touchGestureCooldown = false;
let touchMinPressure = 1;
let touchMaxPressure = 1;

// Functions
function getCanvases() {
    let canvases = [];
    for (const canvas of canvasesParent.querySelectorAll('canvas')) {
        canvases.push(canvas);
    }
    return canvases;
}

function getCanvas(layer) {
    let canvases = getCanvases();
    if (layer == -1) {
        // Get the draw layer
        let i = 0;
        for (const canvas of getCanvases()) {
            if (canvas.dataset.drawLayer == "true") {
                return canvas;
            }
        }
    }
    return canvases.at(layer);
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
    const drawCanvas = getCanvas(-1);
    const drawCtx = getContext(-1);
    const ctx = getContext();
    ctx.globalAlpha = inputAlpha.value / 100;
    ctx.drawImage(drawCanvas, 0, 0, width, height);
    saveUndo();
    ctx.globalAlpha = 1;
    if (cancel) {
        // This is not really efficient, but at least simple.
        undo();
    }
    drawCtx.reset();
}

function pointerdownHandler(e) {
    pointerPositions.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY
    });
}

function pointerupHandler(e) {
    pointerPositions.delete(e.pointerId);
    if (painting && e.pointerId == primaryPointerId) { // End of stroke
        endPainting();
    }
}

function translateBy(dX, dY) {
    translationX += dX;
    translationY += dY;
    rootCanvas.style.translate = `${translationX}px ${translationY}px`;
}

function scaleBy(dScale, originX, originY) {
    const containerRect = canvasesParent.getBoundingClientRect();
    const canvasRect = rootCanvas.getBoundingClientRect();
    const oldScale = scale;
    const newScale = Math.min(Math.max(scale * dScale, minScale), maxScale);
    scale = newScale;
    dScale = newScale/oldScale;
    originX = (originX == undefined) ? (containerRect.left + containerRect.right)/2 : originX;
    originY = (originY == undefined) ? (containerRect.top + containerRect.bottom)/2 : originY;
    let dX = (canvasRect.left + canvasRect.right)/2 - originX;
    let dY = (canvasRect.top + canvasRect.bottom)/2 - originY;

    translateBy(-dX, -dY);
    translateBy(dX * dScale, dY * dScale);

    rootCanvas.style.scale = `${scale}`;
}

function rotateBy(dRadians, centerX, centerY) {
    const rect = rootCanvas.getBoundingClientRect();
    const [cX, cY] = getRectCenter(rect);
    centerX = (centerX == undefined) ? (rect.left + rect.right)/2 : centerX;
    centerY = (centerY == undefined) ? (rect.top + rect.bottom)/2 : centerY;
    rotation += dRadians;
    rootCanvas.style.rotate = `${rotation}rad`;
    let [centerX2, centerY2] = rotateVec(centerX - cX, centerY - cY, dRadians);
    let offsetX = (centerX - cX) - centerX2;
    let offsetY = (centerY - cY) - centerY2;
    translateBy(offsetX, offsetY);
}

function resetTransform() {
    const rect = canvasesParent.getBoundingClientRect();
    const maxHeight = rect.height;
    const maxWidth = rect.width;
    translationX = (width  - maxWidth ) / -2;
    translationY = (height - maxHeight) / -2;
    scale = Math.min(maxWidth/width, maxHeight/height) * 0.95;
    minScale = scale * 0.25;
    maxScale = scale * Math.max(width, height) / 16;
    rotation = 0;
    rootCanvas.style.translate = `${translationX}px ${translationY}px`;
    rootCanvas.style.scale = `${scale}`;
    rootCanvas.style.rotate = `${rotation}rad`;
}

function euclideanLength(x, y) {
    return Math.sqrt(x*x + y*y);
}

function normalize(x, y) {
    const length = euclideanLength(x, y);
    return [
        x/length,
        y/length
    ]
}

function getDirectionVec(toX, toY, fromX, fromY) {
    return normalize(
        toX - fromX,
        toY - fromY
    );
}

function dotProduct(x1, y1, x2, y2) {
    return x1 * x2 + y1 * y2;
}

function getRectCenter(rect) {
    return [
        (rect.right + rect.left) / 2,
        (rect.bottom + rect.top) / 2
    ]
}

function rotateVec(x, y, radians) {
    return [
        x * Math.cos(radians) - y * Math.sin(radians),
        x * Math.sin(radians) + y * Math.cos(radians)
    ]
}

function toCanvasSpace(x, y, canvas) {
    canvas = canvas || getCanvas(selectedLayer);
    const rect = canvas.getBoundingClientRect();
    const [centerX, centerY] = getRectCenter(rect);
    let [offsetX, offsetY] = rotateVec(x - centerX, y - centerY, -rotation);
    return [
        (offsetX/scale + width/2),
        (offsetY/scale + height/2),
    ];
}

function calcAngularDifference(toX, toY, fromX, fromY) {
    return Math.atan2(toX, toY) - Math.atan2(fromX, fromY);
}

function pointermoveHandler(e) {
    e.preventDefault();
    const penDown = e.pressure > 0;
    const isPen = e.pointerType == 'pen';
    const isMouse = e.pointerType == 'mouse';
    const isTouch = e.pointerType == 'touch';
    const canvas = getCanvas(-1);
    const ctx = getContext(-1);
    const primaryButtonDown = e.buttons % 2 == 1;
    const prevPosition = pointerPositions.get(e.pointerId) || {
        clientX: e.clientX,
        clientY: e.clientY
    };
    let penRadius = inputPenSize.value * e.pressure;
    let dragFactor = 1;
    let dX = e.clientX - prevPosition.clientX;
    let dY = e.clientY - prevPosition.clientY;

    pointerPositions.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY
    });

    if (isMouse) {
        penRadius *= 2; // pressure is either 0 or 0.5 for most mice so we normalize it
    }

    if (isTouch) {
        if (e.pressure > 0) {
            if (e.pressure < touchMinPressure) {
                touchMinPressure = e.pressure;
            }
            if (e.pressure > touchMaxPressure) {
                // Yeah, some devices seem to ignore the 0-1 range.
                // My tablet gives (1, infinity) pressure for touch input.
                touchMaxPressure = e.pressure;
            }
            if (touchMaxPressure > touchMinPressure) {
                let pressure = (e.pressure - touchMinPressure)/(touchMaxPressure - touchMinPressure);
                pressure = Math.min(1, pressure * 2); // make it easier to draw
                penRadius = inputPenSize.value * pressure;
            }
        }
        if (Math.abs(dX) < 1 && Math.abs(dY) < 1) {
            return; // Ignore motionless events for touch events (makes gestures more reliable)
        }
        if (activeTouchCount == 2) {
            // Panning
            dragging = true;
            touchGestureCooldown = true;
            dragFactor = 0;
            // Zooming
            let centerX = -e.clientX;
            let centerY = -e.clientY;
            for (const pos of pointerPositions.values()) {
                centerX += pos.clientX;
                centerY += pos.clientY;
            }
            centerX = centerX / (activeTouchCount - 1);
            centerY = centerY / (activeTouchCount - 1);
            const [dirX1, dirY1] = getDirectionVec(
                prevPosition.clientX, prevPosition.clientY,
                centerX, centerY
            );
            const [dirX2, dirY2] = getDirectionVec(
                e.clientX, e.clientY,
                centerX, centerY
            );
            const length1 = euclideanLength(
                prevPosition.clientX - centerX,
                prevPosition.clientY - centerY
            );
            const length2 = euclideanLength(
                e.clientX - centerX,
                e.clientY - centerY
            );
            const angle = calcAngularDifference(dirX1, dirY1, dirX2, dirY2);
            if (length1 > 0) {
                scaleBy(length2/length1, centerX, centerY);
                rotateBy(angle, centerX, centerY);
            }
        }
    }

    const [X, Y] = toCanvasSpace(e.clientX, e.clientY, canvas);

    if (penOnly && !isPen) return; // Ignore unrelated touch events (such as palm).
    if (painting && !e.isPrimary) return; // Ignore secondary touches when drawing
    if (painting && !penDown) { // End of stroke
        endPainting();
    }
    if (
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
        ctx.globalAlpha = 1;
        canvas.style.opacity = inputAlpha.value / 100;
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
            let length = euclideanLength(dirX, dirY);

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
    }
    if (dragging) {
        if (painting) endPainting(true);
        translateBy(dX * dragFactor, dY * dragFactor);
    }
    if (activeTouchCount > 1 && painting) {
        endPainting(true);
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

    rootCanvas.width = width;
    rootCanvas.height = height;
    rootCanvas.style.width = `${width}px`;
    rootCanvas.style.height = `${height}px`;

    let baseCanvas = document.createElement('canvas');
    rootCanvas.append(baseCanvas);

    let drawCanvas = document.createElement('canvas');
    drawCanvas.dataset.drawLayer = "true";
    rootCanvas.append(drawCanvas);

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

function toggleFullscreen(nextState) {
    if (nextState == undefined || nextState == null) {
        nextState = !document.fullscreenElement;
    }
    if (nextState) {
        document.documentElement.requestFullscreen()
        .then(() => {})
        .catch((err) => {});
    } else {
        document.exitFullscreen();
    }
}

function keyDownHandler(e) {
    const key = e.key.toLowerCase();
    if (painting) {

    } else {
        if (e.ctrlKey && key == 'z') {
            e.preventDefault();
            undo();
        }
        if (e.ctrlKey && key == 'y') {
            e.preventDefault();
            redo();
        }
        if (key == 'f11') {
            e.preventDefault();
            toggleFullscreen();
        }
        if (key == 'esc' && document.fullscreenElement) {
            e.preventDefault();
            toggleFullscreen(false);
        }
    }
    if (e.ctrlKey && key == '0') {
        e.preventDefault();
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

function isSafeToClear() {
    if (undoStack.length > 1) return false;
    return true;
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
window.addEventListener("pointerdown", pointerdownHandler);
window.addEventListener("pointerup", pointerupHandler);
window.addEventListener("pointercancel", pointerupHandler);
window.addEventListener('keydown', keyDownHandler);

clearButton.addEventListener("click", () => {
    if (painting) return;
    if (isSafeToClear()) {
        clearCanvas();
    } else if (window.confirm("Clear the canvas? You can't undo this!")) {
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
});

fullscreenButton.addEventListener('click', () => {
    toggleFullscreen();
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
    activeTouchCount = e.touches.length;
    touchGestureCooldown = false;
});

canvasesParent.addEventListener('touchend', function(e) {
    if (!painting && !touchGestureCooldown) {
        if (activeTouchCount == 2) {
            touchGestureCooldown = true;
            undo();
        } else if (activeTouchCount == 3) {
            touchGestureCooldown = true;
            redo();
        }
    }
    activeTouchCount = e.touches.length;
});

canvasesParent.addEventListener('touchcancel', function(e) {
    activeTouchCount = e.touches.length;
    if (painting) {
        endPainting(true);
    }
});

// Canvas zoom with mouse wheel
canvasesParent.addEventListener('wheel', function(e) {
    e.preventDefault();
    const FACTOR = 5/4;
    const direction = (e.deltaY > 0) ? -1 : 1;

    if (e.ctrlKey) {
        scaleBy(FACTOR ** direction, e.clientX, e.clientY);
    } else if (e.shiftKey) {
        rotateBy(direction * Math.PI/18, e.clientX, e.clientY);
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
